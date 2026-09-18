import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'incoming-traffic-logger',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
          const cleanIp = clientIp.replace(/^::ffff:/, '');
          if (!req.url?.includes('/@') && !req.url?.includes('node_modules')) {
            console.log(
              `\x1b[36m📡 [${new Date().toLocaleTimeString('en-IN')}]\x1b[0m \x1b[32m${req.method}\x1b[0m ${req.url} \x1b[90m(from ${cleanIp})\x1b[0m`
            );
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@otp/domain': resolve(__dirname, '../../packages/domain/src/index.ts'),
      // The messaging core lives beside the edge functions, because Supabase
      // deploys that directory on its own and an import reaching into a
      // workspace package would break on deploy. Aliased here so the demo UI
      // runs the same parser and the same message copy as the real webhook,
      // rather than a second copy that drifts.
      '@otp/messaging': resolve(
        __dirname,
        '../../supabase/functions/_shared/messaging/index.ts',
      ),
    },
  },
  // Sentry is loaded dynamically only when VITE_SENTRY_DSN is set, and is not a
  // dependency of the app. Marking it external keeps Rollup from failing when
  // it isn't installed; the dynamic import in `main.tsx` catches the runtime
  // failure and the console-only telemetry stays in place.
  esbuild: {
    target: 'es2022',
  },
  optimizeDeps: {
    exclude: ['@sentry/browser'],
    esbuildOptions: {
      target: 'es2022',
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    emptyOutDir: true,
    rollupOptions: {
      external: ['@sentry/browser'],
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    // Must stay 3000 — supabase/config.toml auth redirect URLs point here.
    host: true,
    port: 3000,
    strictPort: true,
    allowedHosts: true,
    watch: {
      ignored: [
        '**/dist/**',
        '**/dist_prev/**',
        '**/releases/**',
        '**/.git/**',
        '**/supabase/**',
        '**/backups/**',
        '**/*.log',
      ],
    },
    hmr: {
      clientPort: 443,
    },
    proxy: {
      '/auth': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
        ws: true,
      },
      '/rest': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
      },
      '/storage': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
      },
      '/realtime': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
        ws: true,
      },
      '/functions': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
      },
      '/waha': {
        target: 'http://127.0.0.1:3008',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/waha/, ''),
      },
    },
  },
  preview: {
    host: true,
    port: 3000,
    strictPort: true,
    proxy: {
      '/auth': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
        ws: true,
      },
      '/rest': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
      },
      '/storage': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
      },
      '/realtime': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
        ws: true,
      },
      '/functions': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
      },
      '/waha': {
        target: 'http://127.0.0.1:3008',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/waha/, ''),
      },
    },
  },
});
