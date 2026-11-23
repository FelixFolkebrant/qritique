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

test('closing the overlay resumes page animations and stops observing new content', async ({
  page,
}) => {
  await page.evaluate(() => {
    const element = document.createElement('div');
    element.id = 'animated-page-content';
    document.body.append(element);
    Reflect.set(
      window,
      'qritiqueAnimation',
      element.animate([{ opacity: 1 }, { opacity: 0.2 }], { duration: 1000, iterations: Infinity }),
    );
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 1000; i++) fragment.append(document.createElement('span'));
    element.append(fragment);
  });
  await expect
    .poll(() =>
      page.evaluate(() => (Reflect.get(window, 'qritiqueAnimation') as Animation).playState),
    )
    .toBe('paused');
  await page.keyboard.press('Control+Escape');
  await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toHaveCount(0);
  expect(
    await page.evaluate(() => (Reflect.get(window, 'qritiqueAnimation') as Animation).playState),
  ).toBe('running');
  expect(
    await page.evaluate(async () => {
      const element = document.createElement('div');
      document.body.append(element);
      const animation = element.animate([{ opacity: 1 }, { opacity: 0.2 }], {
        duration: 1000,
        iterations: Infinity,
      });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return animation.playState;
    }),
  ).toBe('running');
});

test('box marks stay anchored on scroll, save with notes, and support undo and deletion', async ({
  page,
}) => {
  await expect(page.getByRole('textbox')).toHaveValue('');
  await drawBox(page);
  await expect(marks(page)).toHaveCount(1);
  await page
    .getByRole('textbox', { name: 'Note for selected group' })
    .fill('Simplify the navigation.');
  await page.getByRole('button', { name: 'Red', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveValue('');
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
  await expect(page.getByRole('button', { name: 'Teal', exact: true })).toHaveAttribute(
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

test('keeps color notes available without markings', async ({ page }) => {
  const note = page.getByRole('textbox', { name: 'Note for selected group' });
  await note.fill('Feedback without a marking');
  await page.getByRole('button', { name: 'Red', exact: true }).click();
  await expect(note).toHaveValue('');
  await page.getByRole('button', { name: 'Teal', exact: true }).click();
  await expect(note).toHaveValue('Feedback without a marking');
  await drawBox(page);
  await page.keyboard.press('Delete');
  await expect(marks(page)).toHaveCount(0);
  await expect(note).toHaveValue('Feedback without a marking');
  await page.waitForTimeout(350);
  await page.reload();
  await expect(note).toHaveValue('Feedback without a marking');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Filter colors', exact: true }).click();
  await expect(
    page.getByRole('group', { name: 'Colors', exact: true }).getByRole('button', { name: 'Teal' }),
  ).toBeVisible();
});

test('drawing settings follow the selected tool and keep brush direction', async ({ page }) => {
  await page.getByRole('button', { name: 'Drawing tools', exact: true }).click();
  await page
    .locator('.draw-menu')
    .evaluate((menu) => Promise.all(menu.getAnimations().map((animation) => animation.finished)));
  const size = page.getByRole('slider', { name: 'Stroke size' });
  const pencilMenuBounds = await page.locator('.draw-menu').boundingBox();
  const pencilSliderBounds = await size.boundingBox();
  await expect(page.getByRole('region', { name: 'Pencil settings' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Brush orientation' })).toHaveCount(0);
  await size.focus();
  await page.keyboard.press('Home');
  await expect(size).toHaveValue('2');
  await page.keyboard.press('ArrowRight');
  await expect(size).toHaveValue('3');
  await expect(size).toHaveAttribute('aria-valuetext', '3 pixels');

  const brush = page.getByRole('menuitemradio', { name: 'Brush', exact: true });
  const pencil = page.getByRole('menuitemradio', { name: 'Pencil', exact: true });
  await brush.click();
  await expect(brush).toBeChecked();
  const brushMenuBounds = await page.locator('.draw-menu').boundingBox();
  expect(brushMenuBounds).toEqual(pencilMenuBounds);
  expect(await size.boundingBox()).toEqual(pencilSliderBounds);
  const settings = page.getByRole('region', { name: 'Brush settings' });
  await expect(settings).toBeVisible();
  const toolBounds = await brush.boundingBox();
  const settingsBounds = await settings.boundingBox();
  expect(settingsBounds!.x).toBeGreaterThanOrEqual(toolBounds!.x + toolBounds!.width);
  await page.getByRole('button', { name: 'Vertical brush', exact: true }).click();
  await pencil.click();
  await expect(pencil).toBeChecked();
  await expect(page.getByRole('group', { name: 'Brush orientation' })).toHaveCount(0);
  await brush.click();
  await expect(page.getByRole('button', { name: 'Vertical brush', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await size.focus();
  await page.keyboard.press('End');
  await expect(size).toHaveValue('140');
  await page.setViewportSize({ width: 375, height: 800 });
  const menuBounds = await page.locator('.draw-menu').boundingBox();
  expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
  expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(375);
  await size.click({ position: { x: 74, y: 12 } });
  expect(Number(await size.inputValue())).toBeGreaterThan(2);
  expect(Number(await size.inputValue())).toBeLessThan(140);
});

test('flips brush direction with F and idle right-click while preserving stroke cancellation', async ({
  page,
}) => {
  const drawingTools = page.getByRole('button', { name: 'Drawing tools', exact: true });
  const horizontal = page.getByRole('button', { name: 'Horizontal brush', exact: true });
  const vertical = page.getByRole('button', { name: 'Vertical brush', exact: true });
  await page.keyboard.press('b');
  await page.keyboard.press('f');
  await drawingTools.click();
  await expect(vertical).toHaveAttribute('aria-pressed', 'true');
  await drawingTools.click();
  await page.mouse.click(400, 300, { button: 'right' });
  await expect(marks(page)).toHaveCount(0);
  await drawingTools.click();
  await expect(horizontal).toHaveAttribute('aria-pressed', 'true');
  await drawingTools.click();

  await page.keyboard.press('p');
  await page.keyboard.press('f');
  await page.keyboard.press('b');
  const note = page.getByRole('textbox', { name: 'Note for selected group' });
  await note.focus();
  await page.keyboard.press('f');
  await expect(note).toHaveValue('f');
  await drawingTools.click();
  await expect(horizontal).toHaveAttribute('aria-pressed', 'true');
  await drawingTools.click();

  await page.mouse.move(400, 300);
  await page.mouse.down();
  await page.mouse.move(500, 350, { steps: 5 });
  await page.mouse.click(500, 350, { button: 'right' });
  await page.mouse.up();
  await expect(marks(page)).toHaveCount(0);
  await drawingTools.click();
  await expect(horizontal).toHaveAttribute('aria-pressed', 'true');
  await drawingTools.click();
  await drawBox(page);
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
  await page.getByRole('menuitemradio', { name: 'Brush', exact: true }).click();
  await page.getByRole('button', { name: 'Vertical brush', exact: true }).click();
  await page.getByRole('button', { name: 'Drawing tools', exact: true }).click();
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
  await page.getByRole('button', { name: 'Selector', exact: true }).click();
  const movedCenter = { x: center.x - 150, y: center.y + 30 };
  await drawBox(page, movedCenter, { x: movedCenter.x + 60, y: movedCenter.y + 40 });
  await expect
    .poll(async () => (await page.locator('#create-button').boundingBox())!.x)
    .toBeCloseTo(original!.x - 90, 0);
  await expect(marks(page)).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await page.locator('#create-button').boundingBox())!.x)
    .toBeCloseTo(original!.x - 150, 0);
  await page.keyboard.press('Control+Shift+z');
  await expect
    .poll(async () => (await page.locator('#create-button').boundingBox())!.x)
    .toBeCloseTo(original!.x - 90, 0);
  await page.mouse.move(movedCenter.x + 60, movedCenter.y + 40);
  await page.mouse.down();
  await page.mouse.move(movedCenter.x + 90, movedCenter.y + 40);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await page.locator('#create-button').boundingBox())!.x).toBeCloseTo(original!.x - 90, 0);
  await page.keyboard.press('Control+Escape');
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
  await page.getByRole('button', { name: 'Filter colors', exact: true }).click();
  await page
    .getByRole('group', { name: 'Colors', exact: true })
    .getByRole('button', { name: 'Teal' })
    .click();
  await page.evaluate(() => {
    const writeText = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = async (text) => {
      await new Promise<void>((resolve) => {
        window.addEventListener('release-copy', () => resolve(), { once: true });
      });
      await writeText(text);
    };
  });
  await page.keyboard.press('Control+Shift+c');
  const exportButton = page.getByRole('button', { name: 'Export', exact: true });
  await expect(exportButton).toBeDisabled();
  await expect(page.getByRole('toolbar')).toBeVisible();
  await expect(page.getByRole('textbox')).toBeVisible();
  await expect(marks(page)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('release-copy')));
  const feedback = page.getByRole('status');
  await expect(feedback).toHaveText('Copied notes');
  await expect(exportButton.locator('.lucide-clipboard-check')).toBeVisible();
  const buttonBounds = (await exportButton.boundingBox())!;
  const feedbackBounds = (await feedback.boundingBox())!;
  expect(feedbackBounds.x).toBeGreaterThan(buttonBounds.x + buttonBounds.width);
  expect(feedbackBounds.y + feedbackBounds.height / 2).toBeCloseTo(
    buttonBounds.y + buttonBounds.height / 2,
    0,
  );
  await expect(page.locator('.notice')).toHaveCount(0);
  if (browserName === 'chromium') {
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('Teal (#016471)');
    expect(text).toContain('Give the headline more breathing room.');
  }
  await expect(feedback).toHaveCount(0);
  await expect(exportButton.locator('.lucide-arrow-down-to-line')).toBeVisible();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.keyboard.press('Control+c');
  await expect(page.getByRole('status')).toContainText(
    'Image capture is available in the installed extension',
  );
  await expect(page.getByRole('toolbar')).toBeVisible();
});

test('filters exports by multiple colors and numbers', async ({ page }) => {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Filter colors' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Filter numbers' })).toBeDisabled();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await drawBox(page);
  await page.getByRole('textbox').fill('Teal feedback');
  await page.getByRole('button', { name: 'Red', exact: true }).click();
  await drawBox(page, { x: 500, y: 170 }, { x: 700, y: 310 });
  await page.getByRole('textbox').fill('Red feedback');
  await page.getByRole('button', { name: 'Numbered notes', exact: true }).click();
  await drawBox(page, { x: 80, y: 400 }, { x: 400, y: 550 });
  await page.getByRole('button', { name: 'Note 1', exact: true }).click();
  await page.getByRole('textbox').fill('Number feedback');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Filter colors' }).click();
  const colors = page.getByRole('group', { name: 'Colors', exact: true });
  await colors.getByRole('button', { name: 'Teal' }).click();
  await colors.getByRole('button', { name: 'Red' }).click();
  await expect(colors.getByRole('button', { name: 'Teal' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Filter numbers' }).click();
  await page
    .getByRole('group', { name: 'Numbers', exact: true })
    .getByRole('button', { name: '#1' })
    .click();
  await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: 'Filter colors' }).click();
  await expect(colors.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
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

test('keeps selection actions aligned while moving and resizing', async ({ page }) => {
  await drawBox(page);
  await page.keyboard.press('v');
  await page.mouse.click(150, 200);
  const actions = page.locator('.selection-actions');
  const original = (await actions.boundingBox())!;

  await page.mouse.move(150, 200);
  await page.mouse.down();
  await page.mouse.move(200, 230);
  const moved = (await actions.boundingBox())!;
  expect(moved.x - original.x).toBeCloseTo(50, 0);
  expect(moved.y - original.y).toBeCloseTo(30, 0);
  await page.mouse.up();

  await page.mouse.move(450, 320);
  await page.mouse.down();
  await page.mouse.move(480, 340);
  const resized = (await actions.boundingBox())!;
  expect(resized.x - moved.x).toBeCloseTo(30, 0);
  await page.mouse.up();
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
  await page.getByRole('menuitemradio', { name: 'Use color #992b2b' }).click();
  const first = marks(page).first().locator('rect').first();
  const second = marks(page).last().locator('rect').first();
  await expect(first).toHaveAttribute('fill', '#992b2b');
  await expect(second).toHaveAttribute('fill', '#016471');
  await page.keyboard.press('Control+z');
  await expect(first).toHaveAttribute('fill', '#016471');
  await page.keyboard.press('Control+Shift+z');
  await expect(first).toHaveAttribute('fill', '#992b2b');
});

test('Enter exits a note while Shift+Enter adds a line', async ({ page }) => {
  await drawBox(page);
  const note = page.getByRole('textbox', { name: 'Note for selected group' });
  await note.click();
  await page.keyboard.type('First line');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Second line');
  await expect(note).toBeFocused();
  await expect(note).toHaveValue('First line\nSecond line');
  await page.keyboard.press('Enter');
  await expect(note).not.toBeFocused();
  await expect(note).toHaveValue('First line\nSecond line');
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
  await expect(note).toHaveValue('Keep this note');
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
    'Settings',
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
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const selector = dialog.getByRole('textbox', { name: 'Selector', exact: true });
  await selector.click();
  await page.keyboard.press('r');
  await expect(dialog.getByRole('alert')).toHaveText('Already used for box.');
  await page.keyboard.press('s');
  await expect(selector).toHaveValue('S');
  await dialog.getByRole('button', { name: 'Close settings' }).click();
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
  await dialog.getByRole('button', { name: 'Reset keybinds' }).click();
  await expect(selector).toHaveValue('V');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('searches keybinds by action and current shortcut', async ({ page }) => {
  await revealSessionMenu(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const search = dialog.getByRole('searchbox', { name: 'Search keybinds' });
  await search.fill('inspect');
  await expect(dialog.getByRole('textbox', { name: 'Inspect element' })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Box', exact: true })).toHaveCount(0);
  await search.fill('backspace');
  await expect(dialog.getByRole('textbox', { name: 'Delete selected mark' })).toBeVisible();
  await search.fill('no such shortcut');
  await expect(dialog.getByText('No matching keybinds.')).toBeVisible();
  await search.fill('selector');
  await dialog.getByRole('textbox', { name: 'Selector', exact: true }).click();
  await page.keyboard.press('s');
  await search.fill('s');
  await expect(dialog.getByRole('textbox', { name: 'Selector', exact: true })).toHaveValue('S');
  await search.fill('');
  await expect(dialog.getByRole('textbox', { name: 'Box', exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: 'Teal', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveValue('');
  await page.getByRole('button', { name: 'Box', exact: true }).click();
  await drawBox(page, { x: 100, y: 500 }, { x: 300, y: 650 });
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('textbox')).toHaveValue('');
  await expect(marks(page)).toHaveCount(3);
});

test('deletes selected colors on hover with undo and permits deleting the last color', async ({
  page,
}) => {
  const deleteTeal = page.getByRole('button', { name: 'Delete color #016471' });
  await expect(deleteTeal).toBeHidden();
  await page.getByRole('button', { name: 'Red', exact: true }).hover();
  await expect(page.getByRole('button', { name: 'Delete color #992b2b' })).toHaveCount(0);
  await drawBox(page);
  await page.getByRole('textbox').fill('Teal note');
  await page.getByRole('button', { name: 'Teal', exact: true }).hover();
  await deleteTeal.click();
  await expect(page.getByRole('button', { name: 'Teal', exact: true })).toHaveCount(0);
  await expect(marks(page)).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(marks(page)).toHaveCount(1);
  await expect(page.getByRole('textbox')).toHaveValue('Teal note');
  for (const [name, color] of [
    ['Teal', '#016471'],
    ['Red', '#992b2b'],
    ['Green', '#2b803f'],
  ]) {
    await page.getByRole('button', { name: name!, exact: true }).click();
    await page.getByRole('button', { name: `Delete color ${color}` }).click();
  }
  await expect(
    page.getByRole('group', { name: 'Annotation colors' }).locator('.color-button'),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Note 1', exact: true })).toBeVisible();
  await page.keyboard.press('#');
  await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toBeVisible();
  await page.waitForTimeout(350);
  await page.reload();
  await expect(
    page.getByRole('group', { name: 'Annotation colors' }).locator('.color-button'),
  ).toHaveCount(0);
  await drawBox(page);
  await expect(marks(page).first().locator('text')).toHaveText('1');
});

test('uses color, numbered note, annotation, and close shortcuts', async ({ page }) => {
  await page.keyboard.press('2');
  await expect(page.getByRole('button', { name: 'Red', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await drawBox(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('c');
  const note = page.getByRole('textbox', { name: 'Note for selected group' });
  await expect(note).toBeFocused();
  await note.fill('A note');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+1');
  await expect(page.getByRole('button', { name: 'Add numbered note' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await drawBox(page, { x: 500, y: 150 }, { x: 700, y: 290 });
  await page.keyboard.press('2');
  await expect(page.getByRole('button', { name: 'Red', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Shift+1');
  await expect(page.getByRole('button', { name: 'Note 1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toBeVisible();
  await page.keyboard.press('Control+Escape');
  await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toHaveCount(0);
});

test('limits the palette to five colors', async ({ page }) => {
  const picker = page.getByLabel('Custom color');
  const chooseColor = (color: string) =>
    picker.evaluate((input: HTMLInputElement, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, color);
  await picker.evaluate((input: HTMLInputElement) => {
    input.value = '#aa1122';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = '#bb3344';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(
    page.getByRole('group', { name: 'Annotation colors' }).locator('.color-button'),
  ).toHaveCount(3);
  await chooseColor('#112233');
  await expect(page.getByRole('button', { name: 'Add color' })).toBeEnabled();
  await chooseColor('#445566');
  await expect(page.getByRole('button', { name: 'Add color' })).toHaveCount(0);
  await chooseColor('#778899');
  await expect(
    page.getByRole('group', { name: 'Annotation colors' }).locator('.color-button'),
  ).toHaveCount(5);
  const palette = page.getByRole('group', { name: 'Annotation colors' });
  expect(await palette.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: '#445566', exact: true }).hover();
  await page.getByRole('button', { name: 'Delete color #445566' }).click();
  await expect(page.getByRole('button', { name: 'Add color' })).toBeVisible();
});

test('annotates the most recently selected group, including an unused color', async ({ page }) => {
  await drawBox(page);
  await page.keyboard.press('2');
  await page.keyboard.press('c');
  const note = page.getByRole('textbox', { name: 'Note for selected group' });
  await expect(note).toBeFocused();
  await expect(page.getByRole('button', { name: 'Red', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await note.fill('Red note');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Teal', exact: true }).click();
  await page.keyboard.press('c');
  await expect(note).toBeFocused();
  await expect(note).toHaveValue('');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Red', exact: true }).click();
  await page.keyboard.press('c');
  await expect(note).toHaveValue('Red note');
});

test('numbered mode starts a new group unless an existing number is selected', async ({ page }) => {
  const plus = page.getByRole('button', { name: 'Add numbered note' });
  const one = page.getByRole('button', { name: 'Note 1', exact: true });
  await page.keyboard.press('n');
  await expect(plus).toHaveAttribute('aria-pressed', 'true');
  await expect(one).toHaveAttribute('aria-pressed', 'false');
  await drawBox(page);
  await expect(marks(page).last().locator('text')).toHaveText('1');
  await page.keyboard.press('n');
  await page.keyboard.press('n');
  await expect(plus).toHaveAttribute('aria-pressed', 'true');
  await drawBox(page, { x: 500, y: 150 }, { x: 700, y: 290 });
  await expect(marks(page).last().locator('text')).toHaveText('2');
  await page.keyboard.press('n');
  await page.keyboard.press('n');
  await page.keyboard.press('Shift+1');
  await expect(one).toHaveAttribute('aria-pressed', 'true');
  await expect(plus).toHaveAttribute('aria-pressed', 'false');
  await drawBox(page, { x: 75, y: 350 }, { x: 400, y: 450 });
  await expect(marks(page).last().locator('text')).toHaveText('1');
});

test('returns to a new number after editing a note and selects plus for the next number', async ({
  page,
}) => {
  const plus = page.getByRole('button', { name: 'Add numbered note' });
  await page.keyboard.press('n');
  await page.keyboard.press('Shift+1');
  await expect(plus).toHaveAttribute('aria-pressed', 'true');
  await drawBox(page);
  await page.keyboard.press('c');
  const note = page.getByRole('textbox', { name: 'Note for selected group' });
  await expect(note).toBeFocused();
  await note.fill('First note');
  await page.keyboard.press('Escape');
  await expect(plus).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Shift+2');
  await expect(plus).toHaveAttribute('aria-pressed', 'true');
  await drawBox(page, { x: 500, y: 150 }, { x: 700, y: 290 });
  await expect(marks(page).last().locator('text')).toHaveText('2');
  await page.keyboard.press('Shift+1');
  await page.keyboard.press('c');
  await expect(note).toHaveValue('First note');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Note 1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await drawBox(page, { x: 75, y: 350 }, { x: 400, y: 450 });
  await expect(marks(page).last().locator('text')).toHaveText('1');
});

test('cancels recording with Escape and allows modified Escape shortcuts', async ({ page }) => {
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByRole('textbox', { name: 'Cancel', exact: true })).toHaveCount(0);
  const selector = dialog.getByRole('textbox', { name: 'Selector', exact: true });
  await selector.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(selector).toHaveValue('V');
  await selector.click();
  await page.keyboard.press('Control+Shift+Escape');
  await expect(selector).toHaveValue('Ctrl + Shift + Escape');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('saves a default palette of zero to five colors for new sessions', async ({ page }) => {
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const colors = dialog.locator('.settings-color-input');
  await expect(colors).toHaveCount(3);
  await dialog.getByLabel('Palette color 1', { exact: true }).fill('#123456');
  const chooseColor = async (color: string) => {
    const count = await colors.count();
    await dialog.getByRole('button', { name: 'Add palette color', exact: true }).click();
    await expect(colors).toHaveCount(count);
    await dialog.getByLabel('New palette color', { exact: true }).evaluate((input, value) => {
      (input as HTMLInputElement).value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, color);
  };
  await chooseColor('#445566');
  await chooseColor('#778899');
  await expect(colors).toHaveCount(5);
  await expect(dialog.getByRole('button', { name: 'Add palette color', exact: true })).toHaveCount(
    0,
  );
  await page.addInitScript(() => localStorage.removeItem('qritique:preview-session'));
  await page.reload();
  const palette = page.getByRole('group', { name: 'Annotation colors' });
  await expect(palette.locator('.color-button')).toHaveCount(5);
  await expect(page.getByRole('button', { name: '#123456', exact: true })).toBeVisible();
  await page.keyboard.press('?');
  await expect(colors).toHaveCount(5);
  for (let count = 5; count > 0; count--) {
    await dialog.locator('.color-swatch').first().hover();
    await dialog.getByRole('button', { name: 'Remove palette color 1', exact: true }).click();
  }
  await expect(colors).toHaveCount(0);
  await page.addInitScript(() => localStorage.removeItem('qritique:preview-session'));
  await page.reload();
  await expect(palette.locator('.color-button')).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toBeVisible();
});

test('aligns palette and appearance and persists resetting the palette', async ({ page }) => {
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByRole('img', { name: 'Qritique' })).toBeVisible();
  const paletteHeading = await dialog
    .getByRole('heading', { name: 'Palette', exact: true })
    .boundingBox();
  const appearanceHeading = await dialog
    .getByRole('heading', { name: 'Appearance', exact: true })
    .boundingBox();
  expect(paletteHeading!.y).toBe(appearanceHeading!.y);
  expect(paletteHeading!.x).toBeLessThan(appearanceHeading!.x);
  await dialog.getByLabel('Palette color 1', { exact: true }).fill('#123456');
  await dialog.getByRole('button', { name: 'Reset palette', exact: true }).click();
  const colors = dialog.locator('.settings-color-input');
  await expect(colors).toHaveCount(3);
  for (const [index, color] of ['#016471', '#992b2b', '#2b803f'].entries()) {
    await expect(colors.nth(index)).toHaveValue(color);
  }
  await page.addInitScript(() => localStorage.removeItem('qritique:preview-session'));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Teal', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('?');
  for (const [index, color] of ['#016471', '#992b2b', '#2b803f'].entries()) {
    await expect(colors.nth(index)).toHaveValue(color);
  }
});

test('settings blocks outside clicks and scrolling while allowing its own scrolling', async ({
  page,
}) => {
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const startScroll = await page.evaluate(() => scrollY);
  await drawBox(page, { x: 50, y: 160 }, { x: 200, y: 320 });
  await expect(marks(page)).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.mouse.move(100, 500);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(startScroll);
  const content = dialog.locator('.settings-content');
  await content.hover();
  await page.mouse.wheel(0, 500);
  await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(startScroll);
  await content.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(startScroll);
  await dialog.getByRole('button', { name: 'Close settings' }).click();
  await page.mouse.move(100, 500);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(startScroll);
});

test('captures exact hotkey filters and clears them without changing bindings', async ({
  page,
}) => {
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const capture = dialog.getByRole('button', { name: 'Search by hotkey', exact: true });
  const search = dialog.getByRole('searchbox', { name: 'Search keybinds' });
  const before = await dialog.boundingBox();
  await capture.click();
  await expect(capture).toHaveText('Press keybind');
  await page.keyboard.press('Control');
  await expect(capture).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+c');
  await expect(capture).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: 'Copy image', exact: true })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Copy notes', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: 'Box', exact: true })).toHaveCount(0);
  expect(await dialog.boundingBox()).toEqual(before);
  await dialog.getByRole('button', { name: 'Clear hotkey filter Ctrl + C', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Box', exact: true })).toBeVisible();
  await capture.click();
  await page.keyboard.press('Backspace');
  await expect(dialog.getByRole('textbox', { name: 'Delete selected mark' })).toBeVisible();
  await search.focus();
  await page.keyboard.press('Backspace');
  await expect(dialog.getByRole('textbox', { name: 'Box', exact: true })).toBeVisible();
  await capture.click();
  await page.keyboard.press('Control+Escape');
  await expect(dialog.getByRole('textbox', { name: 'Close', exact: true })).toBeVisible();
  await expect(capture).toHaveCount(0);
  await dialog
    .getByRole('button', { name: 'Clear hotkey filter Ctrl + Escape', exact: true })
    .click();
  await capture.click();
  await page.keyboard.press('Escape');
  await expect(capture).toHaveAttribute('aria-pressed', 'false');
  await expect(dialog).toBeVisible();
  await capture.click();
  await page.keyboard.press('Control+d');
  await expect(dialog.getByText('No matching keybinds.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Clear hotkey filter Ctrl + D', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Selector', exact: true })).toHaveValue('V');
});

test('appearance follows system preference and persists an explicit theme', async ({ page }) => {
  const root = page.locator('.qritique-root');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await revealSessionMenu(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByRole('button', { name: 'System', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toHaveCSS(
    'background-color',
    'rgb(245, 245, 243)',
  );
  await dialog.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await revealSessionMenu(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
});
