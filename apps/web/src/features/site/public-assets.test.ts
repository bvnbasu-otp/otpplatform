import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRODUCT_PLATFORM_SUBTITLE, PRODUCT_TITLE } from '@/lib/brand';
import { OTP_LOGO_SRC } from '@/components/ui/OtpLogo';

const WEB_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PUBLIC_DIR = join(WEB_ROOT, 'public');
const INDEX_HTML = readFileSync(join(WEB_ROOT, 'index.html'), 'utf8');

function decode(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
}

function meta(attr: 'name' | 'property', key: string): string | undefined {
  const tag = INDEX_HTML.match(new RegExp(`<meta[^>]*${attr}="${key}"[^>]*>`, 'i'))?.[0];
  const content = tag?.match(/content="([^"]*)"/)?.[1];
  return content === undefined ? undefined : decode(content);
}

/** A root-relative URL resolved to the file Vite would serve for it. */
function resolvePublicPath(url: string): string {
  const clean = url.split(/[?#]/)[0]!;
  return clean.startsWith('/src/') ? join(WEB_ROOT, clean) : join(PUBLIC_DIR, clean);
}

function expectAssetExists(url: string, referencedFrom: string) {
  const file = resolvePublicPath(url);
  expect(existsSync(file), `${url} (referenced from ${referencedFrom}) is missing at ${file}`).toBe(true);
  expect(statSync(file).size, `${url} is empty`).toBeGreaterThan(0);
}

describe('index.html carries the canonical title and share metadata', () => {
  it('uses the canonical browser title', () => {
    expect(decode(INDEX_HTML.match(/<title>([^<]*)<\/title>/)?.[1] ?? '')).toBe(PRODUCT_TITLE);
    expect(PRODUCT_TITLE).toBe('OTP — Identity-Protected Competitive Sourcing');
  });

  it('uses the canonical subtitle as the meta description', () => {
    expect(meta('name', 'description')).toBe(PRODUCT_PLATFORM_SUBTITLE);
    expect(PRODUCT_PLATFORM_SUBTITLE).toBe(
      'Compare competing supplier quotes and make better procurement decisions.',
    );
  });

  it('uses the canonical title and subtitle on Open Graph and Twitter cards', () => {
    expect(meta('property', 'og:title')).toBe(PRODUCT_TITLE);
    expect(meta('property', 'og:description')).toBe(PRODUCT_PLATFORM_SUBTITLE);
    expect(meta('name', 'twitter:title')).toBe(PRODUCT_TITLE);
    expect(meta('name', 'twitter:description')).toBe(PRODUCT_PLATFORM_SUBTITLE);
  });

  it('carries none of the retired titles', () => {
    expect(INDEX_HTML).not.toMatch(/OTP Platform — Open Trade/);
    expect(INDEX_HTML).not.toMatch(/Neutral Sourcing|Procurement Cockpit/i);
  });
});

describe('every public asset reference resolves to a file on disk', () => {
  it('index.html links and scripts', () => {
    const refs = [...INDEX_HTML.matchAll(/\s(?:href|src)="(\/[^"]+)"/g)].map((m) => m[1]!);
    expect(refs).toEqual(expect.arrayContaining(['/favicon.svg', '/icon.svg', '/manifest.webmanifest']));
    for (const ref of refs) expectAssetExists(ref, 'index.html');
  });

  it('Open Graph image, if declared, exists', () => {
    const image = meta('property', 'og:image');
    if (image && image.startsWith('/')) expectAssetExists(image, 'og:image');
  });

  it('manifest icons exist and the manifest uses the canonical name', () => {
    const manifest = JSON.parse(readFileSync(join(PUBLIC_DIR, 'manifest.webmanifest'), 'utf8')) as {
      name: string;
      description: string;
      icons: { src: string }[];
    };
    expect(manifest.name).toBe(PRODUCT_TITLE);
    expect(manifest.description).toBe(PRODUCT_PLATFORM_SUBTITLE);
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) expectAssetExists(icon.src, 'manifest.webmanifest');
  });

  it('the header logo exists', () => {
    expectAssetExists(OTP_LOGO_SRC, 'OtpLogo');
  });

  it('every root-relative image path in public-facing source exists', () => {
    const roots = [
      join(WEB_ROOT, 'src/features/site'),
      join(WEB_ROOT, 'src/features/portal'),
      join(WEB_ROOT, 'src/components/ui'),
      join(WEB_ROOT, 'src/components/layout'),
      join(WEB_ROOT, 'src/pages'),
    ];
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
      });
    const files = roots.flatMap((dir) => walk(dir));
    let checked = 0;
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/["'`](\/[A-Za-z0-9_\-./]+\.(?:svg|png|jpe?g|webp|ico|gif))["'`]/g)) {
        expectAssetExists(match[1]!, file);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('SVG icons use valid SVG attributes so their gradients render', () => {
    for (const name of ['favicon.svg', 'icon.svg']) {
      const svg = readFileSync(join(PUBLIC_DIR, name), 'utf8');
      expect(svg, name).not.toMatch(/stopColor=/);
      expect(svg, name).toMatch(/<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    }
  });
});
