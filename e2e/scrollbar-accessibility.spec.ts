import { expect, test } from '@playwright/test';

test.describe('responsive scrollbar accessibility', () => {
  test('desktop overflow remains discoverable and keyboard focus is visible', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const result = await page.evaluate(() => {
      const scroller = document.createElement('div');
      scroller.className = 'scrollbar-thin overflow-y-auto';
      scroller.tabIndex = 0;
      scroller.setAttribute('data-testid', 'scrollbar-probe');
      scroller.style.cssText = 'width:160px;height:80px';
      scroller.innerHTML = '<div style="height:400px">Scrollable content</div>';
      document.body.appendChild(scroller);
      scroller.focus();

      const style = getComputedStyle(scroller);
      const body = getComputedStyle(document.body);
      return {
        overflowY: style.overflowY,
        scrollbarWidth: style.scrollbarWidth,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        bodyOverflowX: body.overflowX,
        hasVerticalOverflow: scroller.scrollHeight > scroller.clientHeight,
      };
    });

    expect(result.hasVerticalOverflow).toBe(true);
    expect(result.overflowY).toBe('auto');
    expect(result.scrollbarWidth).not.toBe('none');
    expect(result.outlineStyle).not.toBe('none');
    expect(result.outlineWidth).not.toBe('0px');
    expect(result.bodyOverflowX).toBe('hidden');
  });

  test('phone viewport has no document-level horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await page.goto('/');
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport + 1);
  });
});
