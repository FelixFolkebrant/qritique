import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { emptySession } from '../../src/lib/types';

declare const chrome: typeof import('wxt/browser').browser;

async function launchExtension(deviceScaleFactor = 1) {
  const temp = await mkdtemp(path.join(tmpdir(), 'qritique-extension-'));
  const extension = path.join(temp, 'extension');
  await cp(path.resolve('.output/chrome-mv3'), extension, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
  expect(manifest.permissions).not.toContain('debugger');
  // Automation cannot press the browser's action icon to grant activeTab. The test-only
  // copy grants host access so the built content script and real capture API can run.
  manifest.host_permissions = ['<all_urls>'];
  await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(path.join(temp, 'profile'), {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      '--window-size=1200,887',
      `--force-device-scale-factor=${deviceScaleFactor}`,
    ],
    viewport: null,
  });
  return { temp, context };
}

test('installed Chrome build captures only marked screens and stacks separate sections', async ({
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'The Chromium extension runtime test uses a persistent Chromium profile.',
  );
  test.setTimeout(60000);
  const { temp, context } = await launchExtension();
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
    await page.evaluate(() => {
      document.body.style.minHeight = '12000px';
    });
    await worker.evaluate(() => {
      Reflect.set(globalThis, 'qritiqueCaptureCount', 0);
      chrome.runtime.onMessage.addListener((message) => {
        if (message?.type === 'qritique:capture')
          Reflect.set(
            globalThis,
            'qritiqueCaptureCount',
            Number(Reflect.get(globalThis, 'qritiqueCaptureCount')) + 1,
          );
      });
    });
    await page.mouse.move(70, 120);
    await page.mouse.down();
    await page.mouse.move(400, 300, { steps: 8 });
    await page.mouse.up();
    await page.evaluate(() => scrollTo(0, 1300));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(1300);
    await page.getByRole('button', { name: 'Red', exact: true }).click();
    await page.mouse.move(70, 220);
    await page.mouse.down();
    await page.mouse.move(400, 400, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('[data-annotation-id]')).toHaveCount(2);
    // Put the controls inside the crop so their absence is checked in the exported pixels.
    await page.locator('.dock').evaluate((element) => {
      Object.assign((element as HTMLElement).style, {
        top: '300px',
        bottom: 'auto',
        left: '220px',
        transform: 'none',
      });
    });
    await page.evaluate(() => {
      document.documentElement.dataset.captureScrolls = '0';
      window.addEventListener('scroll', () => {
        document.documentElement.dataset.captureScrolls = String(
          Number(document.documentElement.dataset.captureScrolls) + 1,
        );
      });
    });
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Copy image' }).click({ modifiers: ['Shift'] });
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('qritique-localhost.png');
    const bytes = await readFile((await download.path())!);
    await download.saveAs('/tmp/qritique-export-verified.png');
    await download.saveAs(test.info().outputPath('export.png'));
    expect(await worker.evaluate(() => Reflect.get(globalThis, 'qritiqueCaptureCount'))).toBe(2);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(1300);
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
          first: pixel(68, 68),
          second: pixel(68, 368),
          context: pixel(5, 5),
          controls: pixel(408, 438),
          separator: pixel(200, 288),
        };
      },
      `data:image/png;base64,${bytes.toString('base64')}`,
    );
    expect(pixels.width).toBe(426);
    expect(pixels.height).toBe(576);
    expect(pixels.first[2]!).toBeGreaterThan(pixels.first[0]!);
    expect(pixels.second[0]!).toBeGreaterThan(pixels.second[2]!);
    expect(pixels.context.slice(0, 3)).toEqual([242, 241, 237]);
    expect(pixels.controls.slice(0, 3)).toEqual([216, 221, 211]);
    expect(pixels.separator.slice(0, 3)).toEqual([255, 255, 255]);
    await expect(page.locator('header')).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Image saved');
    expect(errors).toEqual([]);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: 'Filter colors', exact: true }).click();
    await page
      .getByRole('group', { name: 'Colors', exact: true })
      .getByRole('button', { name: 'Red', exact: true })
      .click();
    const filteredDownload = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Copy image' }).click({ modifiers: ['Shift'] });
    const filteredBytes = await readFile((await (await filteredDownload).path())!);
    expect(filteredBytes.readUInt32BE(16)).toBe(426);
    expect(filteredBytes.readUInt32BE(20)).toBe(276);
    expect(await worker.evaluate(() => Reflect.get(globalThis, 'qritiqueCaptureCount'))).toBe(3);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://localhost:5173',
    });
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'http://localhost:5173/tests/fixture.html' });
      await chrome.scripting.executeScript({
        target: { tabId: tab!.id! },
        func: () => {
          const write = navigator.clipboard.write.bind(navigator.clipboard);
          navigator.clipboard.write = async (items) => {
            document.documentElement.dataset.copyPending = 'true';
            await new Promise<void>((resolve) => {
              window.addEventListener('release-copy', () => resolve(), { once: true });
            });
            navigator.clipboard.write = write;
            await write(items);
            delete document.documentElement.dataset.copyPending;
          };
        },
      });
    });
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Copy image' }).click();
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeDisabled();
    await expect(page.locator('html').first()).toHaveAttribute('data-copy-pending', 'true');
    await expect(page.getByRole('toolbar')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('release-copy')));
    await expect(page.getByRole('status')).toHaveText('Copied image');
    await expect(page.locator('.export-anchor .lucide-clipboard-check')).toBeVisible();
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

test('viewport capture keeps cropped marks aligned on high-density displays', async ({
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Uses the installed Chromium extension.');
  const { temp, context } = await launchExtension(2);
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    await page.goto('http://localhost:5173/tests/fixture.html');
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true });
      await chrome.scripting.executeScript({
        target: { tabId: tab!.id! },
        files: ['/content-scripts/annotate.js'],
      });
    });
    await expect(page.getByRole('toolbar')).toBeVisible();
    await page.evaluate(() => scrollTo(0, 1300));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(1300);
    await page.mouse.move(70, 220);
    await page.mouse.down();
    await page.mouse.move(400, 400, { steps: 8 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Copy image' }).click({ modifiers: ['Shift'] });
    const bytes = await readFile((await (await download).path())!);
    expect(bytes.readUInt32BE(16)).toBe(852);
    expect(bytes.readUInt32BE(20)).toBe(552);
    const pixels = await page.evaluate(
      async (uri) => {
        const image = new Image();
        image.src = uri;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        return {
          mark: [...ctx.getImageData(136, 136, 1, 1).data],
          context: [...ctx.getImageData(10, 10, 1, 1).data],
        };
      },
      `data:image/png;base64,${bytes.toString('base64')}`,
    );
    expect(pixels.mark[2]!).toBeGreaterThan(pixels.mark[0]!);
    expect(pixels.context.slice(0, 3)).toEqual([242, 241, 237]);
    expect(await page.evaluate(() => scrollY)).toBe(1300);
  } finally {
    await context.close();
    await rm(temp, { recursive: true, force: true });
  }
});

test('a large marked section is stitched using only the three required screens', async ({
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Uses the installed Chromium extension.');
  const { temp, context } = await launchExtension();
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    await page.goto('http://localhost:5173/tests/fixture.html');
    const session = emptySession();
    session.annotations.push({
      id: 'large',
      groupId: 'teal',
      tool: 'box',
      points: [],
      size: 24,
      bounds: { x: 70, y: 120, width: 330, height: 1600 },
    });
    await worker.evaluate(async (session) => {
      await chrome.storage.local.set({
        'qritique:http://localhost:5173/tests/fixture.html': session,
      });
      Reflect.set(globalThis, 'qritiqueCaptureCount', 0);
      chrome.runtime.onMessage.addListener((message) => {
        if (message?.type === 'qritique:capture')
          Reflect.set(
            globalThis,
            'qritiqueCaptureCount',
            Number(Reflect.get(globalThis, 'qritiqueCaptureCount')) + 1,
          );
      });
      const [tab] = await chrome.tabs.query({ active: true });
      await chrome.scripting.executeScript({
        target: { tabId: tab!.id! },
        files: ['/content-scripts/annotate.js'],
      });
    }, session);
    await expect(page.locator('[data-annotation-id]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Copy image' }).click({ modifiers: ['Shift'] });
    const bytes = await readFile((await (await download).path())!);
    expect(bytes.readUInt32BE(16)).toBe(426);
    expect(bytes.readUInt32BE(20)).toBe(1696);
    expect(await worker.evaluate(() => Reflect.get(globalThis, 'qritiqueCaptureCount'))).toBe(3);
    const pixels = await page.evaluate(
      async (uri) => {
        const image = new Image();
        image.src = uri;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        return [799, 800, 1599, 1600].map((y) =>
          [...ctx.getImageData(408, y, 1, 1).data].slice(0, 3),
        );
      },
      `data:image/png;base64,${bytes.toString('base64')}`,
    );
    expect(pixels).toEqual([
      [242, 241, 237],
      [242, 241, 237],
      [216, 221, 211],
      [216, 221, 211],
    ]);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  } finally {
    await context.close();
    await rm(temp, { recursive: true, force: true });
  }
});

test('image export reports missing marks and restores controls after capture failure', async ({
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Uses the installed Chromium extension.');
  const { temp, context } = await launchExtension();
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    await page.goto('http://localhost:5173/tests/fixture.html');
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true });
      await chrome.scripting.executeScript({
        target: { tabId: tab!.id! },
        files: ['/content-scripts/annotate.js'],
      });
    });
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Copy image' }).click();
    await expect(page.getByRole('status')).toContainText('Mark an area');
    await expect(page.getByRole('toolbar')).toBeVisible();
    await page.mouse.move(70, 120);
    await page.mouse.down();
    await page.mouse.move(400, 300, { steps: 8 });
    await page.mouse.up();
    await page.evaluate(() => scrollTo(0, 1300));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(1300);
    await worker.evaluate(() => {
      const capture = chrome.tabs.captureVisibleTab;
      chrome.tabs.captureVisibleTab = (() => {
        chrome.tabs.captureVisibleTab = capture;
        throw new Error('Capture canceled');
      }) as typeof capture;
    });
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Copy image' }).click();
    await expect(page.getByRole('status')).toContainText('Capture canceled');
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(1300);
    await expect(page.locator('header')).toBeVisible();
    await expect(page.getByRole('toolbar')).toBeVisible();
    await expect(page.locator('[data-annotation-id]')).toBeVisible();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Copy image' }).click({ modifiers: ['Shift'] });
    await download;
    await expect(page.getByRole('status')).toHaveText('Image saved');
  } finally {
    await context.close();
    await rm(temp, { recursive: true, force: true });
  }
});

test('installed note editor matches the selected appearance', async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Uses the installed Chromium extension.');
  const { temp, context } = await launchExtension();
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    await page.goto('http://localhost:5173/tests/fixture.html');
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true });
      await chrome.scripting.executeScript({
        target: { tabId: tab!.id! },
        files: ['/content-scripts/annotate.js'],
      });
    });
    const editor = page.frameLocator('iframe[title="Qritique note editor"]');
    const notePanel = editor.locator('.note-panel');
    const editorRoot = editor.locator('.qritique-root');
    await page.getByRole('button', { name: 'Session menu', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await dialog.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(editorRoot).toHaveCSS('background-color', 'rgb(50, 50, 49)');
    await expect(notePanel).toHaveCSS('border-radius', '0px');
    await dialog.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(editorRoot).toHaveCSS('background-color', 'rgb(245, 245, 243)');
  } finally {
    await context.close();
    await rm(temp, { recursive: true, force: true });
  }
});

test('installed overlay protects notes and ignores synthetic page actions', async ({
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Uses the installed Chromium extension.');
  test.setTimeout(60000);
  const { temp, context } = await launchExtension();
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    await page.goto('http://localhost:5173/tests/fixture.html?secret=query-token#fragment-token');
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true });
      await chrome.scripting.executeScript({
        target: { tabId: tab!.id! },
        files: ['/content-scripts/annotate.js'],
      });
    });
    const note = page.frameLocator('iframe[title="Qritique note editor"]').getByRole('textbox');
    await expect(note).toBeVisible();
    // Website listeners must not receive editor keystrokes or note-bearing messages.
    await page.evaluate(() => {
      document.body.dataset.observedKeys = '';
      document.body.dataset.observedMessages = '';
      window.addEventListener(
        'keydown',
        (event) => {
          document.body.dataset.observedKeys += event.key;
        },
        true,
      );
      window.addEventListener('message', (event) => {
        document.body.dataset.observedMessages += JSON.stringify(event.data);
      });
    });
    await note.pressSequentially('Private feedback', { delay: 10 });
    await expect(note).toHaveValue('Private feedback');
    expect(
      await page.evaluate(() => {
        const shadow = document.querySelector('qritique-overlay')!.shadowRoot!;
        return {
          textarea: shadow.querySelector('textarea'),
          editorDocument: shadow.querySelector('iframe')!.contentDocument,
          keys: document.body.dataset.observedKeys,
          messages: document.body.dataset.observedMessages,
        };
      }),
    ).toEqual({ textarea: null, editorDocument: null, keys: '', messages: '' });
    await page.keyboard.press('Enter');
    await page.mouse.move(70, 120);
    await page.mouse.down();
    await page.mouse.move(400, 300, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('[data-annotation-id]')).toHaveCount(1);
    await page.evaluate(() => {
      for (const event of [
        { key: 'c', code: 'KeyC', ctrlKey: true, shiftKey: true },
        { key: 'c', code: 'KeyC', ctrlKey: true },
        { key: 'Escape', code: 'Escape', ctrlKey: true },
      ])
        window.dispatchEvent(new KeyboardEvent('keydown', { ...event, bubbles: true }));
      const shadow = document.querySelector('qritique-overlay')!.shadowRoot!;
      for (const name of ['Clear markings', 'Close', 'Export'])
        shadow.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!.click();
    });
    await expect(page.locator('[data-annotation-id]')).toHaveCount(1);
    await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toBeVisible();
    await expect(page.getByRole('menu', { name: 'Export annotations' })).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(0);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    for (const name of ['Copy image', 'Copy notes'])
      await page
        .getByRole('menuitem', { name, exact: true })
        .evaluate((button) => (button as HTMLButtonElement).click());
    await expect(page.getByRole('menu', { name: 'Export annotations' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Copy notes', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Copied notes');
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://localhost:5173',
    });
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('Private feedback');
    expect(copied).not.toContain('query-token');
    expect(copied).not.toContain('fragment-token');
    await page.getByRole('button', { name: 'Red', exact: true }).click();
    await expect(note).toHaveValue('');
    await page.getByRole('button', { name: 'Teal', exact: true }).click();
    await expect(note).toHaveValue('Private feedback');
    const storage = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true });
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab!.id! },
        func: async () => {
          try {
            await chrome.storage.local.get(null);
            return 'allowed';
          } catch {
            return 'denied';
          }
        },
      });
      return result!.result;
    });
    expect(storage).toBe('denied');
    // A page-created editor with a guessed channel must never receive saved notes.
    const editorUrl = await page
      .locator('iframe[title="Qritique note editor"]')
      .getAttribute('src');
    await page.evaluate((src) => {
      const frame = document.createElement('iframe');
      frame.id = 'hostile-editor';
      frame.src = src!;
      frame.onload = () => {
        const channelId = '11111111-1111-4111-8111-111111111111';
        frame.contentWindow!.postMessage({ type: 'qritique:note-connect', channelId }, '*');
        const channel = new MessageChannel();
        channel.port1.onmessage = () =>
          channel.port1.postMessage({
            groupId: 'fake',
            note: 'Forged editor',
            focus: 0,
            theme: 'light',
            closeShortcuts: [],
          });
        frame.contentWindow!.postMessage({ type: 'qritique:note-channel', channelId }, '*', [
          channel.port2,
        ]);
      };
      document.body.append(frame);
    }, editorUrl);
    await expect(page.frameLocator('#hostile-editor').locator('body')).toBeAttached();
    await expect(page.frameLocator('#hostile-editor').getByRole('textbox')).toHaveCount(0);
    await expect(note).toHaveValue('Private feedback');
    await page.keyboard.press('Control+Shift+c');
    await expect(page.getByRole('status')).toHaveText('Copied notes');
    await page.keyboard.press('c');
    await expect(note).toBeFocused();
    await page.keyboard.press('Control+Escape');
    await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toHaveCount(0);
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true });
      await chrome.tabs.sendMessage(tab!.id!, { type: 'qritique:toggle' });
    });
    await expect(note).toHaveValue('Private feedback');
    await expect(page.frameLocator('#hostile-editor').getByRole('textbox')).toHaveCount(0);
    const cdp = await context.newCDPSession(page);
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.stopAllWorkers');
    await cdp.detach();
    await note.fill('Edited after the background stopped');
    await expect(note).toHaveValue('Edited after the background stopped');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+Shift+c');
    await expect(page.getByRole('status')).toHaveText('Copied notes');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      'Edited after the background stopped',
    );
    const htmlNote = '<img src=x onerror="document.body.dataset.injected=true">';
    await note.fill(htmlNote);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+Shift+c');
    await expect(page.getByRole('status')).toHaveText('Copied notes');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(htmlNote);
    expect(await page.evaluate(() => document.body.dataset.injected)).toBeUndefined();
  } finally {
    await context.close();
    await rm(temp, { recursive: true, force: true });
  }
});
