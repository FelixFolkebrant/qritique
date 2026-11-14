import { expect, type Page, test } from '@playwright/test';

const marks = (page: Page) => page.locator('[data-annotation-id]');
async function drawBox(page: Page, start = { x: 75, y: 150 }, end = { x: 400, y: 290 }) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toBeVisible();
});

test('box marks stay anchored on scroll, save with notes, and support undo and deletion', async ({
  page,
}) => {
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await drawBox(page);
  await expect(marks(page)).toHaveCount(1);
  await page
    .getByRole('textbox', { name: 'Note for selected group' })
    .fill('Simplify the navigation.');
  await page.getByRole('button', { name: 'Red', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await drawBox(page, { x: 500, y: 170 }, { x: 700, y: 310 });
  await expect(marks(page)).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(marks(page)).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  await expect(marks(page)).toHaveCount(2);
  const originalY = await marks(page).first().locator('rect').first().getAttribute('y');
  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await expect(marks(page).first().locator('rect').first()).toHaveAttribute('y', originalY!);
  await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole('button', { name: 'Selector', exact: true }).click();
  await page.mouse.click(120, 200);
  await expect(page.getByRole('button', { name: 'Blue', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('textbox')).toHaveValue('Simplify the navigation.');
  await page.keyboard.press('Delete');
  await expect(marks(page)).toHaveCount(1);
  await page.waitForTimeout(350);
  await page.reload();
  await expect(marks(page)).toHaveCount(1);
});

test('polygon, pencil, flat brush, and numbered notes work', async ({ page }) => {
  await page.getByRole('button', { name: 'Shape tools', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Polygon' }).click();
  for (const [x, y] of [
    [90, 150],
    [400, 160],
    [350, 360],
    [80, 320],
  ])
    await page.mouse.click(x!, y!);
  await page.keyboard.press('Enter');
  await expect(marks(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Pencil', exact: true }).click();
  await drawBox(page, { x: 500, y: 200 }, { x: 700, y: 350 });
  await expect(marks(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Drawing tools', exact: true }).click();
  await page.getByRole('button', { name: 'Vertical brush', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Brush', exact: true }).click();
  await page.mouse.move(800, 200);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect(page.locator('.annotation-canvas > g > rect').last()).toHaveAttribute(
    'height',
    '26',
  );
  await drawBox(page, { x: 800, y: 200 }, { x: 1000, y: 350 });
  await expect(marks(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Numbered notes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Note 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Note 2', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Shape tools', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Box', exact: true }).click();
  await drawBox(page, { x: 80, y: 400 }, { x: 400, y: 550 });
  await expect(marks(page).last().locator('text')).toHaveText('1');
  await expect(page.getByRole('button', { name: 'Note 2', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Note 1', exact: true }).click();
  await page.getByRole('textbox').fill('Make this section more compact.');
  await page.getByRole('button', { name: 'Add numbered note', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Note 1', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveValue('Make this section more compact.');
});

test('inspect picks real elements and element moves can be undone and restored on exit', async ({
  page,
}) => {
  const original = await page.locator('#create-button').boundingBox();
  expect(original).toBeTruthy();
  const center = { x: original!.x + original!.width / 2, y: original!.y + original!.height / 2 };
  await page.getByRole('button', { name: 'Inspect element', exact: true }).click();
  await page.mouse.move(center.x, center.y);
  await expect(page.locator('.element-label')).toBeVisible();
  await page.mouse.click(center.x, center.y);
  await expect(marks(page)).toHaveCount(1);
  expect(await page.locator('body').getAttribute('data-clicked')).toBeNull();
  await page.getByRole('button', { name: 'Move element', exact: true }).click();
  await drawBox(page, center, { x: center.x - 150, y: center.y + 30 });
  await expect(marks(page)).toHaveCount(2);
  const moved = await page.locator('#create-button').boundingBox();
  expect(moved!.x).toBeCloseTo(original!.x - 150, 0);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await page.locator('#create-button').boundingBox())!.x)
    .toBeCloseTo(original!.x, 0);
  await page.keyboard.press('Control+Shift+z');
  await expect
    .poll(async () => (await page.locator('#create-button').boundingBox())!.x)
    .toBeCloseTo(original!.x - 150, 0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('toolbar')).toHaveCount(0);
  expect((await page.locator('#create-button').boundingBox())!.x).toBeCloseTo(original!.x, 0);
});

test('copies a filtered feedback prompt and reports unavailable preview capture clearly', async ({
  page,
  context,
  browserName,
}) => {
  if (browserName === 'chromium')
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await drawBox(page);
  await page.getByRole('textbox').fill('Give the headline more breathing room.');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Export blue', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Copy notes' }).click();
  await expect(page.getByRole('status')).toHaveText('Notes copied');
  if (browserName === 'chromium') {
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('Blue (#164bff)');
    expect(text).toContain('Give the headline more breathing room.');
  }
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Copy image' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Image capture is available in the installed extension',
  );
  await expect(page.getByRole('toolbar')).toBeVisible();
});

async function revealSessionMenu(page: Page) {
  const viewport = page.viewportSize()!;
  await page.mouse.move(viewport.width - 1, 1);
  await expect(page.getByRole('toolbar', { name: 'Session actions' })).toBeVisible();
}

test('resizes boxes by corners and borders, moves interiors, and undoes each gesture', async ({
  page,
}) => {
  await drawBox(page);
  await page.keyboard.press('v');
  await page.mouse.click(150, 200);
  await drawBox(page, { x: 400, y: 290 }, { x: 450, y: 330 });
  const rect = marks(page).first().locator('rect').first();
  await expect(rect).toHaveAttribute('width', '375');
  await expect(rect).toHaveAttribute('height', '180');
  await page.keyboard.press('Control+z');
  await expect(rect).toHaveAttribute('width', '325');
  await page.keyboard.press('Control+Shift+z');
  await expect(rect).toHaveAttribute('height', '180');
  await drawBox(page, { x: 75, y: 230 }, { x: 100, y: 230 });
  await expect(rect).toHaveAttribute('x', '100');
  await expect(rect).toHaveAttribute('width', '350');
  await drawBox(page, { x: 180, y: 220 }, { x: 200, y: 240 });
  await expect(rect).toHaveAttribute('x', '120');
  await expect(rect).toHaveAttribute('y', '170');
  await page.keyboard.press('Control+z');
  await expect(rect).toHaveAttribute('x', '100');
  await page.keyboard.press('Control+z');
  await expect(rect).toHaveAttribute('x', '75');
  await page.waitForTimeout(350);
  await page.reload();
  await expect(marks(page).first().locator('rect').first()).toHaveAttribute('width', '375');
});

test('changes only the selected marking color and supports undo/redo', async ({ page }) => {
  await drawBox(page);
  await drawBox(page, { x: 500, y: 170 }, { x: 700, y: 310 });
  await page.keyboard.press('v');
  await page.mouse.click(150, 200);
  await page.getByRole('button', { name: 'Change selected area group' }).click();
  await expect(
    page
      .getByRole('menu', { name: 'Selected area group' })
      .getByRole('group', { name: 'Colors', exact: true }),
  ).toHaveText('');
  await page.getByRole('menuitemradio', { name: 'Use color #ff2028' }).click();
  const first = marks(page).first().locator('rect').first();
  const second = marks(page).last().locator('rect').first();
  await expect(first).toHaveAttribute('fill', '#ff2028');
  await expect(second).toHaveAttribute('fill', '#164bff');
  await page.keyboard.press('Control+z');
  await expect(first).toHaveAttribute('fill', '#164bff');
  await page.keyboard.press('Control+Shift+z');
  await expect(first).toHaveAttribute('fill', '#ff2028');
});

test('keeps native text undo in focused notes and marking history elsewhere', async ({ page }) => {
  await drawBox(page);
  const note = page.getByRole('textbox', { name: 'Note for selected group' });
  await note.click();
  await page.keyboard.type('Keep this note');
  await page.keyboard.press('Control+z');
  await expect(note).not.toHaveValue('Keep this note');
  await expect(marks(page)).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  await expect(note).toHaveValue('Keep this note');
  // Clicking the drawing surface must blur the note even though drawing prevents default focus.
  await drawBox(page, { x: 500, y: 170 }, { x: 700, y: 310 });
  await page.keyboard.press('Control+z');
  await expect(marks(page)).toHaveCount(1);
  await expect(note).toHaveValue('Keep this note');
  await page.keyboard.press('Control+z');
  await expect(marks(page)).toHaveCount(0);
  await expect(note).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(marks(page)).toHaveCount(1);
  await expect(note).toHaveValue('Keep this note');
});

test('reveals corner actions, hides existing marks while drawing new ones, clears, undoes, redoes and closes', async ({
  page,
}) => {
  const actions = page.getByRole('toolbar', { name: 'Session actions' });
  await expect(page.getByRole('button', { name: 'Session menu', exact: true })).toBeVisible();
  await expect(actions).toBeHidden();
  await page.mouse.move(1300, 100);
  await expect(actions).toBeHidden();
  await drawBox(page);
  await revealSessionMenu(page);
  expect(
    await actions
      .locator('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
  ).toEqual([
    'Hide existing markings',
    'Keybinds',
    'Undo markings',
    'Redo markings',
    'Clear markings',
    'Close',
  ]);
  await page.getByRole('button', { name: 'Hide existing markings' }).click();
  await expect(marks(page)).toHaveCount(0);
  await drawBox(page, { x: 500, y: 170 }, { x: 700, y: 310 });
  await expect(actions).toBeHidden();
  await expect(marks(page)).toHaveCount(1);
  await revealSessionMenu(page);
  await page.getByRole('button', { name: 'Show markings' }).click();
  await expect(marks(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Clear markings' }).click();
  await expect(marks(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo markings' }).click();
  await expect(marks(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Redo markings' }).click();
  await expect(marks(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toHaveCount(0);
});

test('customizes keybinds, reports conflicts and saves bindings across reloads', async ({
  page,
}) => {
  await revealSessionMenu(page);
  await page.getByRole('button', { name: 'Keybinds', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Keybinds' });
  const selector = dialog.getByRole('textbox', { name: 'Selector', exact: true });
  await selector.click();
  await page.keyboard.press('r');
  await expect(dialog.getByRole('alert')).toHaveText('Already used for box.');
  await page.keyboard.press('s');
  await expect(selector).toHaveValue('S');
  await dialog.getByRole('button', { name: 'Close keybinds' }).click();
  await page.keyboard.press('s');
  await expect(page.getByRole('button', { name: 'Selector', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Selector', exact: true })).toHaveAttribute(
    'title',
    'Selector (S)',
  );
  await page.keyboard.press('s');
  await expect(page.getByRole('button', { name: 'Selector', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('?');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Reset defaults' }).click();
  await expect(selector).toHaveValue('V');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('assigns existing numbered groups and creates a new group in one undoable step', async ({
  page,
}) => {
  await drawBox(page);
  await page.keyboard.press('v');
  await page.mouse.click(150, 200);
  const groupButton = page.getByRole('button', { name: 'Change selected area group' });
  await groupButton.click();
  await page.getByRole('menuitemradio', { name: 'Use numbered group 1' }).click();
  await expect(marks(page).first().locator('text')).toHaveText('1');
  await expect(groupButton).toHaveText('1');
  await page.getByRole('textbox', { name: 'Note for selected group' }).fill('Existing group note');
  await groupButton.click();
  await page.getByRole('menuitem', { name: 'Add numbered group' }).click();
  await expect(marks(page).first().locator('text')).toHaveText('1');
  await expect(groupButton).toHaveText('1');
  await expect(page.getByRole('textbox', { name: 'Note for selected group' })).toHaveValue('');
  await page.keyboard.press('Control+z');
  await expect(marks(page).first().locator('text')).toHaveText('1');
  await expect(page.getByRole('button', { name: 'Note 3', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Note for selected group' })).toHaveValue(
    'Existing group note',
  );
  await page.keyboard.press('Control+Shift+z');
  await expect(marks(page).first().locator('text')).toHaveText('1');
  await expect(page.getByRole('button', { name: 'Note 1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('textbox', { name: 'Note for selected group' })).toHaveValue('');
  await page.waitForTimeout(350);
  await page.reload();
  await expect(marks(page).first().locator('text')).toHaveText('1');
});

test('advances numbered drawings and compacts a category only after its final marking is deleted', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Numbered notes', exact: true }).click();
  for (let n = 1; n <= 4; n++) {
    if (n > 1)
      await expect(page.getByRole('button', { name: `Note ${n}`, exact: true })).toHaveCount(0);
    await page.mouse.move(70 + (n - 1) * 230, 150);
    await page.mouse.down();
    await page.mouse.move(250 + (n - 1) * 230, 290, { steps: 10 });
    await expect(page.getByRole('button', { name: `Note ${n}`, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await page.mouse.up();
    await expect(marks(page).last().locator('text')).toHaveText(String(n));
    await expect(page.getByRole('button', { name: `Note ${n + 1}`, exact: true })).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
  }
  await page.mouse.move(100, 500);
  await page.mouse.down();
  await page.mouse.move(200, 550);
  await expect(page.getByRole('button', { name: 'Note 5', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Note 5', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Note 4', exact: true }).click();
  await page.getByRole('textbox').fill('Keep the fourth note');
  await page.getByRole('button', { name: 'Note 3', exact: true }).click();
  await drawBox(page, { x: 550, y: 350 }, { x: 700, y: 450 });
  await page.keyboard.press('v');
  await page.mouse.click(600, 200);
  await page.keyboard.press('Delete');
  await expect(page.getByRole('button', { name: 'Note 4', exact: true })).toBeVisible();
  await page.mouse.click(600, 400);
  await page.keyboard.press('Delete');
  await expect(page.getByRole('button', { name: 'Note 5', exact: true })).toHaveCount(0);
  await expect(marks(page).locator('text')).toHaveText(['1', '2', '3']);
  await expect(page.getByRole('textbox')).toHaveValue('Keep the fourth note');
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('button', { name: 'Note 4', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Note 5', exact: true })).toHaveCount(0);
  await expect(marks(page).locator('text')).toHaveText(['1', '2', '4', '3']);
  await page.keyboard.press('Control+Shift+z');
  await expect(marks(page).locator('text')).toHaveText(['1', '2', '3']);
  await page.waitForTimeout(350);
  await page.reload();
  await expect(marks(page).locator('text')).toHaveText(['1', '2', '3']);
  await page.getByRole('button', { name: 'Blue', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Box', exact: true }).click();
  await drawBox(page, { x: 100, y: 500 }, { x: 300, y: 650 });
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(marks(page)).toHaveCount(3);
});

test('deletes selected colors on hover with undo and permits deleting the last color', async ({
  page,
}) => {
  const deleteBlue = page.getByRole('button', { name: 'Delete color #164bff' });
  await expect(deleteBlue).toBeHidden();
  await page.getByRole('button', { name: 'Red', exact: true }).hover();
  await expect(page.getByRole('button', { name: 'Delete color #ff2028' })).toHaveCount(0);
  await drawBox(page);
  await page.getByRole('textbox').fill('Blue note');
  await page.getByRole('button', { name: 'Blue', exact: true }).hover();
  await deleteBlue.click();
  await expect(page.getByRole('button', { name: 'Blue', exact: true })).toHaveCount(0);
  await expect(marks(page)).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(marks(page)).toHaveCount(1);
  await expect(page.getByRole('textbox')).toHaveValue('Blue note');
  for (const [name, color] of [
    ['Blue', '#164bff'],
    ['Red', '#ff2028'],
    ['Green', '#28c34e'],
  ]) {
    await page.getByRole('button', { name: name!, exact: true }).click();
    await page.getByRole('button', { name: `Delete color ${color}` }).click();
  }
  await expect(page.getByRole('group', { name: 'Annotation colors' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Note 1', exact: true })).toBeVisible();
  await page.keyboard.press('#');
  await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toBeVisible();
  await page.waitForTimeout(350);
  await page.reload();
  await expect(page.getByRole('group', { name: 'Annotation colors' })).toHaveCount(0);
  await drawBox(page);
  await expect(marks(page).first().locator('text')).toHaveText('1');
});
