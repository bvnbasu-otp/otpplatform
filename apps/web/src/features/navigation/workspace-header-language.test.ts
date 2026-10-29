import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const readFile = (file: string) => readFileSync(join(currentDir, file), 'utf8');

describe('WorkspaceHeader Language Switcher Integration', () => {
  it('integrates LanguageSwitcher into WorkspaceHeader with header placement', () => {
    const headerCode = readFile('components/WorkspaceHeader.tsx');
    expect(headerCode).toContain("import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'");
    expect(headerCode).toContain('<LanguageSwitcher placement="header"');
  });

  it('integrates LanguageSwitcher into WorkspaceHeaderMenu with full menu placement', () => {
    const menuCode = readFile('components/WorkspaceHeaderMenu.tsx');
    expect(menuCode).toContain("import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'");
    expect(menuCode).toContain('<LanguageSwitcher variant="full" placement="menu" />');
    expect(menuCode).toContain('SECTION 4: LANGUAGE SELECTION');
  });

  it('wires useLanguage hook into WorkspaceHeader and WorkspaceHeaderMenu', () => {
    const headerCode = readFile('components/WorkspaceHeader.tsx');
    expect(headerCode).toContain("import { useLanguage } from '@/lib/i18n'");
    expect(headerCode).toContain('const { t } = useLanguage()');

    const menuCode = readFile('components/WorkspaceHeaderMenu.tsx');
    expect(menuCode).toContain("import { useLanguage } from '@/lib/i18n'");
    expect(menuCode).toContain('const { t } = useLanguage()');
  });
it('hides dense role badge, language switcher, and journey strip across viewports for lightweight simplicity', () => {
    const headerCode = readFile('components/WorkspaceHeader.tsx');
    expect(headerCode).toContain('data-testid="header-role-indicator"');
    expect(headerCode).toContain('className="hidden"');
    expect(headerCode).toContain('<LanguageSwitcher placement="header" />');
  });
});
