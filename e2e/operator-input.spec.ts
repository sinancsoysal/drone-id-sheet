import { expect, test, type Page } from '@playwright/test';

const input = (page: Page) => page.getByLabel('Or type or paste an operator ID');
const addButton = (page: Page) => page.getByRole('button', { name: 'Add', exact: true });

async function paste(page: Page, text: string) {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await input(page).focus();
  await page.keyboard.press('ControlOrMeta+V');
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
});

test('formats an ID typed by hand and adds the dashes', async ({ page }) => {
  await input(page).pressSequentially('gbr');
  await expect(input(page)).toHaveValue('GBR-');
  await input(page).pressSequentially('op');
  await expect(input(page)).toHaveValue('GBR-OP-');
  await input(page).pressSequentially('sam!ple 00');
  await expect(input(page)).toHaveValue('GBR-OP-SAMPLE00');
  await expect(page.locator('#op-hint')).toHaveText('4 more letters or numbers after GBR-OP-');
  await expect(addButton(page)).toBeDisabled();

  await input(page).pressSequentially('testEXTRA');
  await expect(input(page)).toHaveValue('GBR-OP-SAMPLE00TEST');
  await expect(page.locator('#op-hint')).toHaveText('Complete. Press Add or Enter.');
  await input(page).press('Enter');
  await expect(page.getByTestId('operator-item')).toContainText('GBR-OP-SAMPLE00TEST');
  await expect(input(page)).toHaveValue('');
});

test('fills in the prefix when only the 12 characters are typed', async ({ page }) => {
  await input(page).pressSequentially('sample00test');
  await expect(input(page)).toHaveValue('GBR-OP-SAMPLE00TEST');
  await addButton(page).click();
  await expect(page.getByTestId('operator-item')).toHaveCount(1);
});

test('backspace removes characters through the dashes', async ({ page }) => {
  await input(page).pressSequentially('gbrop');
  await expect(input(page)).toHaveValue('GBR-OP-');
  await input(page).press('Backspace');
  await expect(input(page)).toHaveValue('GBR-O');
  await input(page).press('Backspace');
  await input(page).press('Backspace');
  await expect(input(page)).toHaveValue('GB');
});

test('adds a pasted ID straight away, ignoring text around it', async ({ page }) => {
  await paste(page, 'Your operator ID: gbr-op-sample00test (valid until 2027)');
  await expect(page.getByTestId('operator-item')).toContainText('GBR-OP-SAMPLE00TEST');
  await expect(input(page)).toHaveValue('');
});

test('adds every ID when several are pasted at once', async ({ page }) => {
  await paste(page, 'GBR-OP-SAMPLE00TEST, GBR-OP-SAMPLE00TWO2');
  await expect(page.getByTestId('operator-item')).toHaveCount(2);
});

test('refuses a flyer ID and says where it goes', async ({ page }) => {
  await paste(page, 'GBR-RP-SAMPLEALEX01');
  await expect(page.locator('#messages li.error')).toContainText('looks like a flyer ID');
  await expect(input(page)).toHaveValue('');
  await expect(page.getByTestId('operator-item')).toHaveCount(0);
});
