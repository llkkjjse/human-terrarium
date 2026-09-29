import { expect, test } from '@playwright/test';
import { installMockAi } from '../fixtures/mock-ai';

test('pauses a failed AI frame without time travel and retries the same frame', async ({ page }) => {
  await installMockAi(page, { failFirstFrame: true });
  await page.goto('/');
  await page.getByLabel('\u793e\u4f1a\u63cf\u8ff0').fill('\u4e00\u4e2a\u7528\u4e8e\u6545\u969c\u6062\u590d\u6d4b\u8bd5\u7684\u793e\u533a\u3002');
  await page.getByRole('button', { name: '\u751f\u6210\u793e\u4f1a' }).click();
  await page.getByRole('button', { name: '\u786e\u8ba4\u5e76\u8fdb\u5165\u793e\u4f1a' }).click();

  await page.getByRole('button', { name: '\u534a\u5929' }).click();
  await page.getByRole('button', { name: '\u63a8\u8fdb\u4e00\u5e27' }).click();
  await expect(page.getByRole('alert')).toContainText('mock timeout');
  await expect.poll(() => page.evaluate(() => window.HumanTerrarium?.v2.getWorldSnapshot().tick)).toBe(0);

  await page.getByRole('button', { name: '\u91cd\u8bd5\u5f53\u524d\u5e27' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.HumanTerrarium?.v2.getWorldSnapshot().tick)).toBe(12);
});
