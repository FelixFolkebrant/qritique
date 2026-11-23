import { browser } from 'wxt/browser';
import { connectNoteEditors } from '../lib/extension-notes';
import { isClipboardMessage } from '../lib/messages';
import { handleStorage } from '../lib/storage';
import type { Message } from '../lib/types';

let captureQueue: Promise<unknown> = Promise.resolve();
let lastCapture = 0;
function captureTab(windowId: number, tabId: number, url: string) {
  const task = captureQueue.then(async () => {
    if (!import.meta.env.FIREFOX) {
      const wait = 550 - (Date.now() - lastCapture);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    }
    const [active] = await browser.tabs.query({ active: true, windowId });
    if (active?.id !== tabId) throw new Error('Keep the annotated tab active while exporting.');
    if (active.url !== url) throw new Error('The page changed while capturing. Please try again.');
    lastCapture = Date.now();
    const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
    const [current] = await browser.tabs.query({ active: true, windowId });
    if (current?.id !== tabId || current.url !== url)
      throw new Error('The page changed while capturing. Please try again.');
    return dataUrl;
  });
  captureQueue = task.catch(() => {});
  return task;
}

// Insecure websites do not expose navigator.clipboard. A focused extension page
// provides a secure fallback; offscreen documents cannot write PNG clipboard data.
async function copyInExtensionPage(
  message: Message,
  sourceTab?: { id?: number; windowId?: number },
) {
  const tab = await browser.tabs.create({
    url: browser.runtime.getURL('/clipboard.html'),
    active: true,
    windowId: sourceTab?.windowId,
  });
  if (tab.id == null) throw new Error('Unable to open the clipboard helper.');
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(onUpdated);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error('The clipboard helper did not load. Shift-click Copy image to save a PNG.'),
        );
      }, 10000);
      const onUpdated = (id: number, info: { status?: string }) => {
        if (id === tab.id && info.status === 'complete') {
          cleanup();
          resolve();
        }
      };
      browser.tabs.onUpdated.addListener(onUpdated);
      void browser.tabs.get(tab.id!).then(
        (current) => {
          if (current.status === 'complete') {
            cleanup();
            resolve();
          }
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
    });
    const response = await browser.runtime.sendMessage({ ...message, target: 'clipboard' });
    if (response?.error) throw new Error(response.error);
    if (!response?.ok) throw new Error('The clipboard helper did not respond.');
  } finally {
    await browser.tabs.remove(tab.id).catch(() => {});
    if (sourceTab?.id != null)
      await browser.tabs.update(sourceTab.id, { active: true }).catch(() => {});
  }
}

export default defineBackground(() => {
  connectNoteEditors();
  const storageReady = import.meta.env.FIREFOX
    ? Promise.resolve()
    : browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id == null) return;
    try {
      if (tab.incognito) throw new Error('Qritique is unavailable in private windows.');
      let ready = false;
      try {
        ready = Boolean((await browser.tabs.sendMessage(tab.id, { type: 'qritique:ping' })).ready);
      } catch {
        /* First activation. */
      }
      if (ready) await browser.tabs.sendMessage(tab.id, { type: 'qritique:toggle' });
      else
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['/content-scripts/annotate.js'],
        });
      await browser.action.setBadgeText({ tabId: tab.id, text: '' });
      await browser.action.setTitle({ tabId: tab.id, title: 'Start / stop Qritique' });
    } catch {
      await browser.action.setBadgeText({ tabId: tab.id, text: '!' });
      await browser.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#d73b40' });
      await browser.action.setTitle({
        tabId: tab.id,
        title: 'Qritique cannot annotate this page. Open a regular website and try again.',
      });
    }
  });
  browser.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    if (!message || typeof message !== 'object' || 'target' in message) return;
    if (typeof message.type !== 'string' || sender.id !== browser.runtime.id) return;
    if (
      ![
        'qritique:capture',
        'qritique:copy-image',
        'qritique:copy-text',
        'qritique:load',
        'qritique:save',
      ].includes(message.type)
    )
      return;
    void (async () => {
      if (
        sender.frameId !== 0 ||
        !Number.isInteger(sender.tab?.id) ||
        !Number.isInteger(sender.tab?.windowId) ||
        !sender.url ||
        !/^(https?|file):/.test(sender.url)
      )
        throw new Error('No annotated website for this request.');
      if (sender.tab?.incognito) throw new Error('Qritique is unavailable in private windows.');
      if (message.type === 'qritique:load' || message.type === 'qritique:save') {
        await storageReady;
        return handleStorage(message, sender.url);
      }
      if (message.type === 'qritique:capture') {
        if (sender.frameId !== 0 || !sender.tab?.id || sender.tab.windowId == null)
          throw new Error('No website to capture.');
        return {
          dataUrl: await captureTab(sender.tab.windowId, sender.tab.id, sender.url),
        };
      }
      if (message.type === 'qritique:copy-image' || message.type === 'qritique:copy-text') {
        if (!isClipboardMessage(message)) throw new Error('Invalid clipboard content.');
        if (import.meta.env.FIREFOX) {
          if (message.type === 'qritique:copy-image') {
            const bytes = await (await fetch(message.dataUrl)).arrayBuffer();
            const firefox = browser as unknown as {
              clipboard: { setImageData(data: ArrayBuffer, type: 'png'): Promise<void> };
            };
            await firefox.clipboard.setImageData(bytes, 'png');
          } else await navigator.clipboard.writeText(message.text);
        } else {
          await copyInExtensionPage(message, sender.tab);
        }
        return { ok: true };
      }
    })().then(sendResponse, (error: unknown) =>
      sendResponse({
        error: error instanceof Error ? error.message : 'Unable to export.',
      }),
    );
    return true;
  });
});
