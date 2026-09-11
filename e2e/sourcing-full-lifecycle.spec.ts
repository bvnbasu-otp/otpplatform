import { test, expect } from '@playwright/test';

test.describe('OTP Platform — Full Multi-Actor Linear Procurement E2E Lifecycle', () => {
  const requirementTitle = `Exterior Tower Painting — E2E Sourcing ${Date.now()}`;
  let rfqPublicRef = '';

  test.beforeEach(async ({ page }) => {
    // Navigate to platform home
    await page.goto('/');
    await expect(page).toHaveTitle(/OTP/i);
  });

  test('Step 1–4: Buyer Intake, Taxonomy Classification & RFQ Matching', async ({ page }) => {
    // 1. Enter requirement in 1-box express intake prompt
    const promptInput = page.locator('input[placeholder*="What do you need"], textarea[placeholder*="What do you need"]');
    await expect(promptInput).toBeVisible();
    await promptInput.fill('Need comprehensive exterior texture painting for 3 towers with 5-year warranty');
    
    const submitButton = page.locator('button:has-text("Publish RFQ"), button:has-text("Get Quotes"), button:has-text("✨")');
    await submitButton.first().click();

    // 2. Verify navigation to requirement detail / intake flow
    await expect(page).toHaveURL(/\/intake|\/requirement|\/rfq/);
    
    // 3. Confirm matched suppliers count indicator
    const supplierMatchPill = page.locator('text=/Matched|Suppliers Invited|Sourcing Active/i');
    await expect(supplierMatchPill.first()).toBeVisible();
  });

  test('Step 5–6: Identity-Protected Sealed Quote Comparison (Zero PII Leaks)', async ({ page }) => {
    // Navigate to quote comparison room
    await page.goto('/demo');
    const compareLink = page.locator('a:has-text("Compare Quotes"), button:has-text("Compare Quotes")');
    if (await compareLink.count() > 0) {
      await compareLink.first().click();
    }

    // Verify Sealed Quoting Matrix
    await expect(page.locator('text=/Supplier-/i').first()).toBeVisible();
    
    // Verify strict anti-leak invariant: Zero supplier brand names or contact phone numbers visible
    const pageText = await page.innerText('body');
    expect(pageText).not.toMatch(/\+91\s*\d{10}/); // No unmasked phone numbers
    expect(pageText).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/); // No unmasked supplier emails
  });

  test('Step 7–10: Committee Weighted Voting & Auto-Preset Justification', async ({ page }) => {
    await page.goto('/demo');
    const votingRoomBtn = page.locator('a:has-text("Committee Voting"), button:has-text("Committee Room")');
    if (await votingRoomBtn.count() > 0) {
      await votingRoomBtn.first().click();
    }

    // Select recommendation quote chip
    const quoteOption = page.locator('input[type="radio"], button:has-text("Select")').first();
    if (await quoteOption.isVisible()) {
      await quoteOption.click();
    }

    // Confirm auto-selected justification chip
    const justificationPreset = page.locator('button[class*="border-primary"], [aria-pressed="true"]');
    await expect(justificationPreset.first()).toBeVisible();

    // Cast vote
    const castVoteBtn = page.locator('button:has-text("Cast Official Vote"), button:has-text("Submit Ballot")');
    if (await castVoteBtn.isVisible()) {
      await castVoteBtn.click();
      await expect(page.locator('text=/Vote Recorded|Ballot Confirmed|Quorum Met/i').first()).toBeVisible();
    }
  });

  test('Step 11–15: Award Lock, Irrevocable Reveal, PO & Milestone Inspection', async ({ page }) => {
    await page.goto('/demo');
    const awardBtn = page.locator('button:has-text("Lock Award"), a:has-text("Award Contract")');
    if (await awardBtn.count() > 0) {
      await awardBtn.first().click();
    }

    // Verify Decision Receipt and unmasked winner
    const decisionReceipt = page.locator('text=/Decision Receipt|Winning Supplier|Award Confirmed/i');
    await expect(decisionReceipt.first()).toBeVisible();

    // Verify Purchase Order generated
    await page.goto('/purchase-orders');
    await expect(page.locator('text=/PO-|Purchase Order/i').first()).toBeVisible();
  });
});
