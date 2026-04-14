import { test, expect } from '@playwright/test';

test('capture pick-em page', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('http://localhost:3000/dashboard/pick-em', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/pickem-before.png' });
});
