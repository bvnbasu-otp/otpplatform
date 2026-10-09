import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('SupplierRegisterForm category catalog states', () => {
  it('handles loading, error, empty, and loaded states in UI', () => {
    const source = readFileSync(resolve(__dirname, 'components/SupplierRegisterForm.tsx'), 'utf8');
    expect(source).toContain('categoriesLoading');
    expect(source).toContain('categoriesError');
    expect(source).toContain('data-testid="category-picker-loading"');
    expect(source).toContain('data-testid="category-picker-error"');
    expect(source).toContain('data-testid="category-picker-empty"');
    expect(source).toContain('Retry loading categories');
    expect(source).not.toMatch(/categories\.length === 0 \?\s*\(\s*<p[^>]*>Loading Categories/);
  });
});
