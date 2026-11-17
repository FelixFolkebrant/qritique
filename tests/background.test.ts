import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MessageListener = (
  message: unknown,
  sender: unknown,
  respond: (response: unknown) => void,
) => unknown;

const { browser, listeners, active } = vi.hoisted(() => {
  const listeners: { message?: MessageListener } = {};
  const active = { id: 1 };
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
        query: vi.fn(async () => [{ id: active.id }]),
        captureVisibleTab: vi.fn(async () => 'data:image/png;base64,pixels'),
      },
    },
  };
});

vi.mock('wxt/browser', () => ({ browser }));

const sender = {
  id: 'qritique',
  tab: { id: 1, windowId: 10 },
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
});
