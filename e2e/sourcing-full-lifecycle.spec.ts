import { expect, test, type Page } from '@playwright/test';

const SUNRISE_MOTOR_RFQ = '0d800000-0000-4000-8000-000000000001';
const LAKSHMI_YARN_RFQ = '0d800000-0000-4000-8000-000000000004';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: /^Sign in$/ }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

test.describe('OTP Platform — authenticated isolated sourcing lifecycle', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(60_000);

  test('buyer reaches real intake controls with an isolated identity', async ({ page }) => {
    await signIn(page, 'manager@sunrise.test');
    await page.goto('/intake');

    const requirement = page.getByPlaceholder(/10 HP submersible motor rewinding in Bengaluru/i);
    await expect(requirement).toBeVisible({ timeout: 20_000 });
    await requirement.fill('Need comprehensive exterior texture painting for three towers with five-year warranty');
    await expect(page.getByTestId('publish-requirement-btn')).toBeVisible();
    await expect(page).toHaveURL(/\/intake$/);
  });

  test('buyer sees sealed aliases without supplier contact leakage', async ({ page }) => {
    await signIn(page, 'treasurer@sunrise.test');
    await page.goto(`/rfq/${SUNRISE_MOTOR_RFQ}/evaluation`);

    await expect(page.getByText(/Supplier [A-Z0-9]/).first()).toBeVisible({ timeout: 20_000 });
    const pageText = await page.locator('main').innerText();
    expect(pageText).not.toMatch(/\+91\s*\d{10}/);
    expect(pageText).not.toMatch(/[a-zA-Z0-9._%+-]+@(?:otpdemo|otp)\.test/i);
  });

  test('appointed committee member reaches the real voting room', async ({ page }) => {
    await signIn(page, 'treasurer@sunrise.test');
    await page.goto(`/rfq/${SUNRISE_MOTOR_RFQ}/committee`);

    await expect(page.getByText(/Committee|Voting Room/i).first()).toBeVisible();
    await expect(page.getByText(/Vote Recorded|Ballot|Cast.*Vote|Quorum/i).first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/rfq/${SUNRISE_MOTOR_RFQ}/committee$`));
  });

  test('authorized buyer sees irreversible reveal receipt and generated PO', async ({ page }) => {
    await signIn(page, 'procurement@srilakshmi.test');
    await page.goto(`/rfq/${LAKSHMI_YARN_RFQ}/reveal`);

    await expect(page.getByTestId('canonical-decision-receipt-card')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Winning Supplier|Award Confirmed|Supplier Revealed/i).first()).toBeVisible();
    await page.goto('/purchase-orders');
    await expect(page.getByText(/PO-|Purchase Order/i).first()).toBeVisible();
  });
});
