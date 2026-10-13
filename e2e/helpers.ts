import { mkdirSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const fixture = (name: string) => join(import.meta.dirname, 'fixtures', name);
export const FLYERS = [fixture('sample-flyer-id-alex.pdf'), fixture('sample-flyer-id-sam.pdf')];
export const OPERATOR_PDF = fixture('sample-operator-id.pdf');

/**
 * Saves a named screenshot for the how-to guide. Every run writes them to
 * test-results/guide/<project>; with UPDATE_GUIDE=1 the desktop ones also
 * replace the images in public/guide that the guide page shows.
 */
export async function guideShot(target: Page | Locator, name: string, info: TestInfo) {
  const file = join('test-results', 'guide', info.project.name, `${name}.png`);
  mkdirSync(dirname(file), { recursive: true });
  const body = await target.screenshot({ path: file, animations: 'disabled' });
  await info.attach(name, { body, contentType: 'image/png' });
  if (process.env.UPDATE_GUIDE && info.project.name === 'desktop') {
    await copyFile(file, join('public', 'guide', `${name}.png`));
  }
}

/** Waits until the preview shows the latest version of the sheet. */
export async function previewReady(page: Page, pages = 1) {
  await expect(page.getByTestId('preview')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#preview canvas')).toHaveCount(pages);
}

export async function pdfText(bytes: Uint8Array): Promise<string[]> {
  const task = getDocument({ data: bytes.slice(), standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '));
  }
  await task.destroy();
  return pages;
}

/** Stands in for the Netlify functions so the order flow runs without Stripe. */
export async function mockOrderApi(page: Page) {
  const requests: { cards: string[]; operatorIds: string[] }[] = [];
  await page.route('**/api/checkout', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { url: '/order-success.html?session_id=cs_test_e2e', ref: 'DIS-E2ETEST' } });
  });
  await page.route('**/api/order-status*', (route) =>
    route.fulfill({ json: { ref: 'DIS-E2ETEST', paid: true, status: 'paid', email: 'pilot@example.com' } }));
  return requests;
}
