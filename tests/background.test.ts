import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultKeybindings } from '../src/lib/keybindings';
import { emptySession } from '../src/lib/types';

type MessageListener = (
  message: unknown,
  sender: unknown,
  respond: (response: unknown) => void,
) => unknown;

const { browser, listeners, active } = vi.hoisted(() => {
  const listeners: { message?: MessageListener } = {};
  const active = { id: 1, url: 'https://example.com/review?draft=1' };
  return {
    active,
    listeners,
    browser: {
      runtime: {
        id: 'qritique',
        getURL: (path: string) => `chrome-extension://qritique${path}`,
        onConnect: { addListener: vi.fn() },
        onMessage: {
          addListener: (listener: MessageListener) => {
            listeners.message = listener;
          },
        },
      },
      action: { onClicked: { addListener: vi.fn() } },
      storage: {
        local: { setAccessLevel: vi.fn().mockResolvedValue(undefined), get: vi.fn(), set: vi.fn() },
      },
      tabs: {
        query: vi.fn(async () => [{ ...active }]),
        captureVisibleTab: vi.fn(async () => 'data:image/png;base64,pixels'),
      },
    },
  };
});

vi.mock('wxt/browser', () => ({ browser }));

const sender = {
  id: 'qritique',
  tab: { id: 1, windowId: 10, incognito: false },
  frameId: 0,
  url: 'https://example.com/review?draft=1',
};
function request(message: unknown, source = sender) {
  return new Promise<unknown>((resolve) => listeners.message!(message, source, resolve));
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(10000);
  active.id = 1;
  active.url = sender.url;
  vi.stubGlobal('defineBackground', (main: () => void) => ({ main }));
  const { default: background } = await import('../src/entrypoints/background');
  background.main();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('background hardening', () => {
  it('rejects a queued capture when the user switches tabs and allows later captures', async () => {
    expect(await request({ type: 'qritique:capture' })).toHaveProperty('dataUrl');
    const queued = request({ type: 'qritique:capture' });
    await vi.advanceTimersByTimeAsync(0);
    active.id = 2;
    await vi.advanceTimersByTimeAsync(550);
    expect(await queued).toEqual({ error: 'Keep the annotated tab active while exporting.' });
    expect(browser.tabs.captureVisibleTab).toHaveBeenCalledTimes(1);
    active.id = 1;
    expect(await request({ type: 'qritique:capture' })).toHaveProperty('dataUrl');
    expect(browser.tabs.captureVisibleTab).toHaveBeenCalledTimes(2);
  });

  it('reports capture failures and allows later captures', async () => {
    browser.tabs.captureVisibleTab.mockRejectedValueOnce(new Error('Capture canceled'));
    expect(await request({ type: 'qritique:capture' })).toEqual({ error: 'Capture canceled' });
    await vi.advanceTimersByTimeAsync(550);
    expect(await request({ type: 'qritique:capture' })).toHaveProperty('dataUrl');
  });

  it('rejects capture requests from embedded frames', async () => {
    expect(await request({ type: 'qritique:capture' }, { ...sender, frameId: 2 })).toEqual({
      error: 'No annotated website for this request.',
    });
    expect(browser.tabs.captureVisibleTab).not.toHaveBeenCalled();
  });

  it('restricts Chrome storage access to trusted contexts', () => {
    expect(browser.storage.local.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_CONTEXTS',
    });
  });

  it('derives session storage from the sender and rejects arbitrary storage names', async () => {
    browser.storage.local.get.mockResolvedValue({
      'qritique:https://example.com/review?draft=1': 'current session',
    });
    expect(
      await request({
        type: 'qritique:load',
        name: 'session',
        key: 'qritique:https://other.com/private',
      }),
    ).toEqual({ value: 'current session' });
    expect(browser.storage.local.get).toHaveBeenCalledWith(
      'qritique:https://example.com/review?draft=1',
    );
    expect(
      await request({ type: 'qritique:load', name: 'qritique:https://other.com/private' }),
    ).toHaveProperty('error');
    expect(browser.storage.local.get).toHaveBeenCalledTimes(1);
  });

  it('rejects storage access from an embedded extension frame', async () => {
    expect(
      await request({ type: 'qritique:load', name: 'session' }, { ...sender, frameId: 2 }),
    ).toHaveProperty('error');
    expect(browser.storage.local.get).not.toHaveBeenCalled();
  });

  it('discards a capture if navigation happens while the browser takes the screenshot', async () => {
    browser.tabs.captureVisibleTab.mockImplementationOnce(async () => {
      active.url = 'https://example.com/another-page';
      return 'data:image/png;base64,pixels';
    });
    expect(await request({ type: 'qritique:capture' })).toEqual({
      error: 'The page changed while capturing. Please try again.',
    });
  });

  it('ignores malformed message types without throwing', () => {
    expect(() => listeners.message!({ type: 42 }, sender, vi.fn())).not.toThrow();
    expect(listeners.message!({ type: 'unrelated' }, sender, vi.fn())).toBeUndefined();
  });

  it('rejects remote image URLs and oversized clipboard text before any clipboard work', async () => {
    expect(
      await request({ type: 'qritique:copy-image', dataUrl: 'https://example.com/pixel.png' }),
    ).toEqual({ error: 'Invalid clipboard content.' });
    expect(await request({ type: 'qritique:copy-text', text: 'x'.repeat(1_000_001) })).toEqual({
      error: 'Invalid clipboard content.',
    });
    expect(browser.tabs.captureVisibleTab).not.toHaveBeenCalled();
  });

  it('rejects clipboard requests from subframes and private tabs', async () => {
    const message = { type: 'qritique:copy-text', text: 'private' };
    expect(await request(message, { ...sender, frameId: 2 })).toHaveProperty('error');
    expect(
      await request(message, { ...sender, tab: { ...sender.tab, incognito: true } }),
    ).toHaveProperty('error', 'Qritique is unavailable in private windows.');
  });

  it('does not read or write stored feedback for private tabs', async () => {
    const privateSender = { ...sender, tab: { ...sender.tab, incognito: true } };
    expect(await request({ type: 'qritique:load', name: 'session' }, privateSender)).toHaveProperty(
      'error',
    );
    expect(
      await request(
        { type: 'qritique:save', name: 'session', value: emptySession() },
        privateSender,
      ),
    ).toHaveProperty('error');
    expect(browser.storage.local.get).not.toHaveBeenCalled();
    expect(browser.storage.local.set).not.toHaveBeenCalled();
  });

  it('validates every stored preference and rejects oversized sessions', async () => {
    for (const [name, value] of [
      ['theme', 'javascript:alert(1)'],
      ['palette', ['red']],
      ['keybindings', { close: ['Escape'] }],
      ['session', { ...emptySession(), annotations: [{ tool: 'unknown' }] }],
    ])
      expect(await request({ type: 'qritique:save', name, value })).toHaveProperty('error');
    const session = emptySession();
    session.groups[0]!.note = 'x'.repeat(4 * 1024 * 1024);
    expect(
      await request({ type: 'qritique:save', name: 'session', value: session }),
    ).toHaveProperty('error', expect.stringContaining('too large'));
    expect(browser.storage.local.set).not.toHaveBeenCalled();
    for (const [name, value] of [
      ['theme', 'light'],
      ['palette', ['#123456']],
      ['keybindings', defaultKeybindings()],
      ['session', emptySession()],
    ])
      expect(await request({ type: 'qritique:save', name, value })).toEqual({ ok: true });
    expect(browser.storage.local.set).toHaveBeenCalledTimes(4);
  });

  it('counts UTF-8 bytes when limiting saved feedback', async () => {
    const session = emptySession();
    session.groups[0]!.note = '😀'.repeat(1024 * 1024);
    expect(JSON.stringify(session).length).toBeLessThan(4 * 1024 * 1024);
    expect(
      await request({ type: 'qritique:save', name: 'session', value: session }),
    ).toHaveProperty('error', expect.stringContaining('too large'));
    expect(browser.storage.local.set).not.toHaveBeenCalled();
  });
});
