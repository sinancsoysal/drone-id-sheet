import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { MAX_CARD_UPLOAD_BYTES } from '../src/lib/pricing';
import { FLYERS, fixture, mockOrderApi, pdfText, previewReady } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('downloaded PDF holds the cards and the operator ID labels', async ({ page }, info) => {
  await page.setInputFiles('#file', FLYERS);
  await page.getByLabel('Or type or paste an operator ID').fill('gbr-op-sample00test');
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

test('a failed sheet shows a message instead of leaving the page busy', async ({ page }) => {
  await page.route('**/fonts/DejaVuSansMono-Bold.ttf', (route) => route.fulfill({ status: 503, body: 'down' }));
  await page.setInputFiles('#file', [FLYERS[0]]);
  await expect(page.locator('#messages')).toContainText('Something went wrong making the sheet');
  await expect(page.getByTestId('preview')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeDisabled();

  // once the font loads again, the next change builds the sheet
  await page.unroute('**/fonts/DejaVuSansMono-Bold.ttf');
  await page.getByLabel('Or type or paste an operator ID').fill('gbr-op-sample00test');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await previewReady(page);
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
});

test('the order button works again after coming back from Stripe', async ({ page }) => {
  // the request never answers, as when the browser has already left for Stripe
  await page.route('**/api/checkout', () => {});
  await page.setInputFiles('#file', [FLYERS[0]]);
  await previewReady(page);
  await page.getByRole('button', { name: /Order and pay/ }).click();
  await expect(page.locator('#order')).toHaveText('Preparing your order…');
  await expect(page.locator('#order')).toBeDisabled();

  // what the browser fires when Back restores the page from its cache
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.locator('#order')).toHaveText('Order and pay £4.99');
  await expect(page.locator('#order')).toBeEnabled();
});

test('a phone photo of a card is small enough to order', async ({ page }, info) => {
  const requests = await mockOrderApi(page);
  // a busy 12 MP photo with the card in the middle
  const photo = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 4032;
    c.height = 3024;
    const x = c.getContext('2d')!;
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    x.fillStyle = '#7a6a55';
    x.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 6000; i++) {
      x.fillStyle = `hsl(${rand() * 360},40%,${30 + rand() * 40}%)`;
      x.fillRect(rand() * c.width, rand() * c.height, 40, 40);
    }
    x.fillStyle = '#fff';
    x.fillRect(800, 700, 2400, 1500);
    x.fillStyle = '#000';
    x.font = 'bold 120px sans-serif';
    x.fillText('GBR-RP-SAMPLEPHOTO1', 900, 1200);
    return c.toDataURL('image/jpeg', 0.92).split(',')[1];
  });
  await page.setInputFiles('#file', { name: 'card-photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(photo, 'base64') });
  await previewReady(page);
  await page.getByRole('button', { name: /Order and pay/ }).click();
  await expect(page).toHaveURL(/order-success/);
  const card = Buffer.from(requests[0].cards[0], 'base64');
  await info.attach('upload size', { body: `${card.length} bytes` });
  expect(card.length).toBeLessThan(MAX_CARD_UPLOAD_BYTES + 10_000);
});
