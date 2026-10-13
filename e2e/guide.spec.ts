import { expect, test } from '@playwright/test';
import { FLYERS, OPERATOR_PDF, guideShot, mockOrderApi, previewReady } from './helpers';

test('make a sheet from two flyer IDs and an operator ID, then order it', async ({ page }, info) => {
  const orders = await mockOrderApi(page);

  await test.step('open the page', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('#step-check')).toBeHidden();
    await guideShot(page, '01-start', info);
  });

  await test.step('add the flyer ID and operator ID PDFs', async () => {
    await page.setInputFiles('#file', [...FLYERS, OPERATOR_PDF]);
    await expect(page.getByTestId('card-item')).toHaveCount(2);
    await expect(page.getByTestId('operator-item')).toHaveCount(1);
    await expect(page.getByTestId('card-item').first()).toContainText('GBR-RP-SAMPLEALEX01');
    await expect(page.getByTestId('card-item').first()).toContainText('ALEX EXAMPLE');
    await expect(page.getByTestId('card-item').nth(1)).toContainText('GBR-RP-SAMPLESAM002');
    await expect(page.getByTestId('card-item').nth(1)).toContainText('SAM SAMPLE · expires 2 February 2031');
    await expect(page.getByTestId('operator-item')).toContainText('GBR-OP-SAMPLE00TEST');
    await expect(page.locator('#messages li')).toHaveCount(0);
    await guideShot(page.locator('#step-check .lists'), '02-added', info);
  });

  await test.step('check the preview', async () => {
    await previewReady(page);
    await page.locator('#preview').scrollIntoViewIfNeeded();
    await guideShot(page.locator('#preview'), '03-preview', info);
  });

  await test.step('see both ways to get the sheet', async () => {
    await expect(page.locator('#order-total')).toHaveText('£6.48');
    await expect(page.getByRole('button', { name: 'Order and pay £6.48' })).toBeEnabled();
    await page.locator('#step-get').scrollIntoViewIfNeeded();
    await guideShot(page.locator('#step-get'), '04-get', info);
  });

  await test.step('download the free PDF', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).click()]);
    expect(download.suggestedFilename()).toBe('drone-id-sheet.pdf');
    await download.saveAs(info.outputPath('drone-id-sheet.pdf'));
  });

  await test.step('order the printed version', async () => {
    await page.getByRole('button', { name: /Order and pay/ }).click();
    await expect(page).toHaveURL(/order-success\.html/);
    await expect(page.getByTestId('order-ref')).toHaveText('DIS-E2ETEST');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Thank you, your order is paid');
    await guideShot(page, '05-order-done', info);
    expect(orders).toHaveLength(1);
    expect(orders[0].cards).toHaveLength(2);
    expect(orders[0].operatorIds).toEqual(['GBR-OP-SAMPLE00TEST']);
  });
});
