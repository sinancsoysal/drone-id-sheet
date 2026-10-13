import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { FLYERS, fixture, pdfText, previewReady } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('downloaded PDF holds the cards and the operator ID labels', async ({ page }, info) => {
  await page.setInputFiles('#file', FLYERS);
  await page.getByLabel('Or type an operator ID').fill('gbr-op-sample00test');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByTestId('operator-item')).toContainText('GBR-OP-SAMPLE00TEST');
  await previewReady(page);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).click()]);
  const path = info.outputPath('drone-id-sheet.pdf');
  await download.saveAs(path);
  const pages = await pdfText(new Uint8Array(await readFile(path)));
  expect(pages).toHaveLength(1);
  expect(pages[0]).toContain('GBR-RP-SAMPLEALEX01');
  expect(pages[0]).toContain('GBR-RP-SAMPLESAM002');
  expect(pages[0]).toContain('GBR-OP-SAMPLE00TEST');
});

test('crops the card and leaves out browser headers and footers', async ({ page }) => {
  // the second sample has a printed header and footer around the card, like a browser adds
  await page.setInputFiles('#file', [FLYERS[1]]);
  const img = page.getByTestId('card-item').locator('img');
  await expect(img).toBeVisible();
  const aspect = await img.evaluate((i: HTMLImageElement) => i.naturalHeight / i.naturalWidth);
  expect(aspect).toBeCloseTo(158 / 222, 1);
});

test('explains operator IDs that are wrong', async ({ page }) => {
  const input = page.getByLabel('Or type an operator ID');
  await input.fill('GBR-RP-SAMPLEALEX01');
  await input.press('Enter');
  await expect(page.locator('#messages li.error')).toContainText('is a flyer ID');
  await input.fill('GBR-OP-123');
  await input.press('Enter');
  await expect(page.locator('#messages li.error')).toContainText("doesn't look right");
  await expect(page.locator('#step-check')).toBeHidden();
});

test('warns about files without an ID and about duplicates', async ({ page }) => {
  await page.setInputFiles('#file', [fixture('not-an-id.pdf')]);
  await expect(page.locator('#messages')).toContainText('no flyer ID or operator ID found');
  await page.setInputFiles('#file', [FLYERS[0]]);
  await expect(page.getByTestId('card-item')).toHaveCount(1);
  await page.setInputFiles('#file', [FLYERS[0]]);
  await expect(page.locator('#messages')).toContainText('GBR-RP-SAMPLEALEX01 is already on the sheet');
  await expect(page.getByTestId('card-item')).toHaveCount(1);
});

test('removing everything hides the later steps', async ({ page }) => {
  await page.setInputFiles('#file', [FLYERS[0]]);
  await expect(page.locator('#step-get')).toBeVisible();
  await page.getByRole('button', { name: 'Remove GBR-RP-SAMPLEALEX01' }).click();
  await expect(page.locator('#step-check')).toBeHidden();
  await expect(page.locator('#step-get')).toBeHidden();
});

test('shows a clear message when ordering is unavailable', async ({ page }) => {
  await page.route('**/api/checkout', (route) =>
    route.fulfill({ status: 503, json: { error: 'Ordering is not set up yet. You can still download the PDF for free.' } }));
  await page.setInputFiles('#file', [FLYERS[0]]);
  await page.getByRole('button', { name: /Order and pay/ }).click();
  await expect(page.locator('#order-error')).toHaveText(/not set up yet/);
  await expect(page.getByRole('button', { name: /Order and pay/ })).toBeEnabled();
});
