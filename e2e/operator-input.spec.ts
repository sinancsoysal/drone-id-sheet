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

test('takes operator IDs from other countries as typed', async ({ page }) => {
  await input(page).pressSequentially('FIN87astrdge12k8');
  await expect(input(page)).toHaveValue('FIN87astrdge12k8');
  await expect(addButton(page)).toBeEnabled();
  await addButton(page).click();
  await expect(page.getByTestId('operator-item')).toContainText('FIN87astrdge12k8');
});

test('leaves out letters the labels cannot print and says so', async ({ page }) => {
  await input(page).pressSequentially('FIN87');
  await input(page).pressSequentially('東');
  await expect(input(page)).toHaveValue('FIN87');
  await expect(page.locator('#op-hint')).toHaveText("The labels can't print 東, so it was left out.");
  await input(page).pressSequentially('ΑΒ');
  await expect(input(page)).toHaveValue('FIN87ΑΒ');
  await expect(page.locator('#op-hint')).toHaveText('Press Add or Enter when it matches your registration.');
});

test('stops at the longest ID that fits on a label', async ({ page }) => {
  await paste(page, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123');
  await expect(input(page)).toHaveValue('ABCDEFGHIJKLMNOPQRSTUVWX');
  await expect(page.locator('#op-hint')).toContainText('most that fits on a label');
  await expect(page.getByTestId('operator-item')).toHaveCount(0);
});

test('a symbol typed in the middle is dropped without moving the caret to the end', async ({ page }) => {
  await input(page).pressSequentially('FRA123');
  await input(page).press('ArrowLeft');
  await input(page).press('ArrowLeft');
  await input(page).pressSequentially('#x');
  await expect(input(page)).toHaveValue('FRA1x23');
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

for (const typed of ['gbrop', 'gbropsa', 'gb']) {
  test(`pasting a full ID after typing "${typed}" replaces it`, async ({ page }) => {
    await input(page).pressSequentially(typed);
    await paste(page, 'GBR-OP-SAMPLE00TEST');
    await expect(page.getByTestId('operator-item')).toHaveCount(1);
    await expect(page.getByTestId('operator-item')).toContainText('GBR-OP-SAMPLE00TEST');
    await expect(input(page)).toHaveValue('');
  });
}

test('a partial paste joins what was typed', async ({ page }) => {
  await input(page).pressSequentially('gbr-op-');
  await paste(page, 'sample');
  await expect(input(page)).toHaveValue('GBR-OP-SAMPLE');
  await expect(page.getByTestId('operator-item')).toHaveCount(0);
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
