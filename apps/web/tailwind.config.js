import colors from 'tailwindcss/colors';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    resolve(__dirname, 'index.html'),
    resolve(__dirname, 'src/**/*.{ts,tsx}'),
  ],
  theme: {
    screens: {
      xs: '380px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input, var(--border)) / <alpha-value>)',
        ring: 'hsl(var(--ring, var(--primary)) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        persona: {
          brand: 'hsl(var(--persona-brand) / <alpha-value>)',
          hover: 'hsl(var(--persona-brand-hover) / <alpha-value>)',
          soft: 'hsl(var(--persona-soft) / <alpha-value>)',
          border: 'hsl(var(--persona-border) / <alpha-value>)',
        },
        status: {
          draft: 'hsl(var(--status-draft) / <alpha-value>)',
          quoting: 'hsl(var(--status-quoting) / <alpha-value>)',
          evaluating: 'hsl(var(--status-evaluating) / <alpha-value>)',
          awarded: 'hsl(var(--status-awarded) / <alpha-value>)',
          po: 'hsl(var(--status-po) / <alpha-value>)',
          warning: 'hsl(var(--status-warning) / <alpha-value>)',
          danger: 'hsl(var(--status-danger) / <alpha-value>)',
        },
        navy: {
          DEFAULT: 'hsl(var(--navy) / <alpha-value>)',
          soft: 'hsl(var(--navy-soft) / <alpha-value>)',
          foreground: 'hsl(var(--navy-foreground) / <alpha-value>)',
          muted: 'hsl(var(--navy-muted) / <alpha-value>)',
          faint: 'hsl(var(--navy-faint) / <alpha-value>)',
          line: 'hsl(var(--navy-line) / <alpha-value>)',
        },
        // Keeps Tailwind's numeric slate scale usable alongside the two named
        // tokens, so `text-slate` and `text-slate-500` both mean something.
        slate: {
          ...colors.slate,
          DEFAULT: 'hsl(var(--slate) / <alpha-value>)',
          soft: 'hsl(var(--slate-soft) / <alpha-value>)',
        },
        action: {
          DEFAULT: 'hsl(var(--action) / <alpha-value>)',
          hover: 'hsl(var(--action-hover) / <alpha-value>)',
          foreground: 'hsl(var(--action-foreground) / <alpha-value>)',
          soft: 'hsl(var(--action-soft) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
