import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon } from '../Icon';

describe('Google Material Symbols Icon Component', () => {
  it('renders standard Google Material Symbols Outlined font class', () => {
    const html = renderToStaticMarkup(<Icon name="home" />);
    expect(html).toContain('material-symbols-outlined');
    expect(html).toContain('data-icon="home"');
    expect(html).toContain('>home<');
  });

  it('renders customized optical size and weight styling', () => {
    const html = renderToStaticMarkup(<Icon name="receipt_long" size={28} weight={700} filled />);
    expect(html).toContain('font-size:28px');
    expect(html).toContain('FILL');
    expect(html).toContain('wght');
    expect(html).toContain('opsz');
  });

  it('supports custom classes and aria-hidden accessibility standard', () => {
    const html = renderToStaticMarkup(<Icon name="person" className="text-primary hover:text-foreground" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('text-primary');
    expect(html).toContain('hover:text-foreground');
  });
});
