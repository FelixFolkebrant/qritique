import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';

declare const chrome: typeof import('wxt/browser').browser;

test('installed Chrome build captures all marks across the full page without the toolbar', async ({
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'The Chromium extension runtime test uses a persistent Chromium profile.',
  );
  test.setTimeout(60000);
  const temp = await mkdtemp(path.join(tmpdir(), 'qritique-extension-'));
  const extension = path.join(temp, 'extension');
  await cp(path.resolve('.output/chrome-mv3'), extension, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
  // Automation cannot press the browser's action icon to grant activeTab. The test-only
  // copy grants host access so the built content script and real capture API can run.
  manifest.host_permissions = ['<all_urls>'];
  await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(path.join(temp, 'profile'), {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1200, height: 800 },
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:5173/tests/fixture.html');
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'http://localhost:5173/tests/fixture.html' });
      await chrome.scripting.executeScript({
        target: { tabId: tab!.id! },
        files: ['/content-scripts/annotate.js'],
      });
    });
    await expect(page.getByRole('toolbar')).toBeVisible();
    await page.mouse.move(70, 120);
    await page.mouse.down();
    await page.mouse.move(400, 300, { steps: 8 });
    await page.mouse.up();
    await page.evaluate(() => scrollTo(0, 1300));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(1300);
    await page.mouse.move(70, 220);
    await page.mouse.down();
    await page.mouse.move(400, 400, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('[data-annotation-id]')).toHaveCount(2);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Copy image' }).click({ modifiers: ['Shift'] });
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('qritique-localhost.png');
    const bytes = await readFile((await download.path())!);
    const pixels = await page.evaluate(
      async (dataUrl) => {
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        const pixel = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data];
        return {
          width: image.width,
          height: image.height,
          first: pixel(90, 140),
          second: pixel(90, 1540),
          dock: pixel(600, 760),
          headerDuplicate: pixel(600, 820),
        };
      },
      `data:image/png;base64,${bytes.toString('base64')}`,
    );
    expect(pixels.width).toBe(1200);
    expect(pixels.height).toBe(2250);
    expect(pixels.first[2]!).toBeGreaterThan(pixels.first[0]!);
    expect(pixels.second[2]!).toBeGreaterThan(pixels.second[0]!);
    expect(pixels.dock.slice(0, 3)).toEqual([242, 241, 237]);
    expect(pixels.headerDuplicate.slice(0, 3)).toEqual([242, 241, 237]);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(1300);
    await expect(page.getByRole('status')).toHaveText('Image saved');
    expect(errors).toEqual([]);
    await download.saveAs('/tmp/qritique-export-verified.png');
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://localhost:5173',
    });
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Copy image' }).click();
    await expect(page.getByRole('status')).toHaveText('Image copied');
    const clipboardTypes = await page.evaluate(async () =>
      (await navigator.clipboard.read()).flatMap((item) => item.types),
    );
    expect(clipboardTypes).toContain('image/png');
    // Also exercise the focused extension-page fallback used on HTTP websites.
    const fallback = await worker.evaluate(
      async (dataUrl) => {
        const [tab] = await chrome.tabs.query({ url: 'http://localhost:5173/tests/fixture.html' });
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab!.id! },
          func: async (uri) =>
            chrome.runtime.sendMessage({ type: 'qritique:copy-image', dataUrl: uri }),
          args: [dataUrl],
        });
        return result[0]?.result;
      },
      `data:image/png;base64,${bytes.toString('base64')}`,
    );
    expect(fallback).toEqual({ ok: true });
    const toggle = () =>
      worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ url: 'http://localhost:5173/tests/fixture.html' });
        return chrome.tabs.sendMessage(tab!.id!, { type: 'qritique:toggle' });
      });
    await toggle();
    await expect(page.getByRole('toolbar')).toHaveCount(0);
    await toggle();
    await expect(page.getByRole('toolbar')).toBeVisible();
    await expect(page.locator('[data-annotation-id]')).toHaveCount(2);
  } finally {
    await context.close();
    await rm(temp, { recursive: true, force: true });
  }
});
