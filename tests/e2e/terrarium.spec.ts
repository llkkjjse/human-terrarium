import { expect, test } from '@playwright/test';
import { installMockAi } from '../fixtures/mock-ai';

test('creates, governs, observes and restores an AI society', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installMockAi(page);
  await page.goto('/');

  await page.getByLabel('\u793e\u4f1a\u63cf\u8ff0').fill('\u9636\u7ea7\u5dee\u8ddd\u660e\u663e\uff0c\u90bb\u91cc\u7231\u804a\u516b\u5366\u7684\u793e\u533a\u3002');
  await page.getByLabel('\u9636\u7ea7\u5dee\u8ddd').fill('82');
  await page.getByRole('button', { name: '\u751f\u6210\u793e\u4f1a' }).click();
  await expect(page.locator('input[aria-label^="\u5c45\u6c11\u59d3\u540d"]')).toHaveCount(24);
  await page.getByRole('button', { name: '\u786e\u8ba4\u5e76\u8fdb\u5165\u793e\u4f1a' }).click();

  await expect(page.getByRole('heading', { name: 'E2E Human Terrarium' })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();

  const policyDraft = page.getByLabel('\u81ea\u7136\u8bed\u8a00\u653f\u7b56');
  await policyDraft.fill('\u4e3a\u65e0\u623f\u5c45\u6c11\u63d0\u4f9b\u8865\u8d34\u3002');
  await page.getByLabel('\u653f\u7b56\u5f3a\u5ea6').fill('70');
  await expect(page.getByText('Policy implementation committed')).toHaveCount(0);
  await page.getByRole('button', { name: '\u6b63\u5f0f\u5b9e\u65bd\u653f\u7b56' }).click();
  await expect(page.getByText('Policy implementation committed')).toBeVisible();

  await page.getByRole('button', { name: /Resident 01/ }).click();
  await page.getByRole('button', { name: 'Traits & abilities' }).click();
  await page.getByLabel('Custom trait').fill('Never lies, even when a lie would achieve the goal.');
  await page.getByLabel('Player goal').fill('Become wealthy immediately.');
  await page.getByLabel('Strength').fill('35');
  await page.getByRole('button', { name: 'Save resident edits' }).click();
  await expect(page.getByText('Resident edits committed for the next frame.')).toBeVisible();

  await page.getByLabel('Forced event').fill('Resident 01 suddenly collapses and must be taken to hospital.');
  await page.getByRole('button', { name: 'Queue forced event' }).click();
  await expect(page.getByText(/\u5f3a\u5236\u4e8b\u4ef6/)).toBeVisible();

  await page.getByRole('button', { name: '\u63a8\u8fdb\u4e00\u5e27' }).click();
  await expect(page.getByText(/Sudden illness/)).toBeVisible();
  await expect(page.getByText(/\u539f\u6587\uff1aResident 01 suddenly collapses/)).toBeVisible();

  await page.getByRole('button', { name: 'Life history' }).click();
  await expect(page.getByText(/custom trait is considered/i)).toBeVisible();
  await page.getByRole('button', { name: 'Conversations' }).click();
  await expect(page.getByText(/I heard the housing policy changed/)).toContainText('who it actually helps');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'E2E Human Terrarium' })).toBeVisible();
  await expect(page.getByText(/Sudden illness/)).toBeVisible();
  expect(errors).toEqual([]);
});
