import { expect, test } from '@playwright/test';

test('runs the observable world and era director in a real browser', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '人间一隅' })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('24 位居民')).toBeVisible();

  await page.getByLabel('经济景气').fill('35');
  await expect(page.getByLabel('自定义时代名称')).toBeVisible();
  await page.getByRole('button', { name: /陈晨/ }).click();
  await expect(page.getByLabel('居民档案').getByRole('heading', { name: '陈晨' })).toBeVisible();
  await expect(page.getByText('时代参数发生变化')).toBeVisible();
  expect(errors).toEqual([]);
});

