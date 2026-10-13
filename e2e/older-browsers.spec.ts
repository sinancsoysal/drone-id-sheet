import { expect, test } from '@playwright/test';
import { FLYERS, previewReady } from './helpers';

// Firefox ESR and older Safari lack some very new built-ins that pdf.js uses.
// Remove them before the page loads to make sure the app still reads PDFs.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const proto of [Map.prototype, WeakMap.prototype] as unknown as Record<string, unknown>[]) {
      delete proto.getOrInsert;
      delete proto.getOrInsertComputed;
    }
    delete (Math as unknown as Record<string, unknown>).sumPrecise;
  });
});

test('reads a flyer ID in a browser without the newest JavaScript features', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.setInputFiles('#file', [FLYERS[0]]);
  await expect(page.getByTestId('card-item')).toContainText('GBR-RP-SAMPLEALEX01');
  await previewReady(page);
  await expect(page.locator('#messages li.error')).toHaveCount(0);
  expect(errors).toEqual([]);
});
