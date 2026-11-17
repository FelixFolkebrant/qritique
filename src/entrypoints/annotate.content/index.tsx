import '../../assets/style.css';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { App } from '../../components/App';
import { type Bridge, copyImageLocally, downloadLocally } from '../../lib/bridge';
import { extensionNoteEditor } from '../../lib/extension-notes';
import { readKeybindings } from '../../lib/keybindings';
import { readTheme } from '../../lib/theme';
import { emptySession, isSession, type Message, readPalette } from '../../lib/types';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*', 'file:///*'],
  registration: 'runtime',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const send = async (message: Message) => {
      const result = await browser.runtime.sendMessage(message);
      if (result?.error) throw new Error(result.error);
      return result;
    };
    const bridge: Bridge = {
      noteEditor: extensionNoteEditor,
      async loadTheme() {
        return readTheme((await send({ type: 'qritique:load', name: 'theme' })).value);
      },
      async saveTheme(theme) {
        await send({ type: 'qritique:save', name: 'theme', value: theme });
      },
      async loadPalette() {
        return readPalette((await send({ type: 'qritique:load', name: 'palette' })).value);
      },
      async savePalette(colors) {
        await send({ type: 'qritique:save', name: 'palette', value: colors });
      },
      async loadKeybindings() {
        return readKeybindings((await send({ type: 'qritique:load', name: 'keybindings' })).value);
      },
      async saveKeybindings(bindings) {
        await send({ type: 'qritique:save', name: 'keybindings', value: bindings });
      },
      async load() {
        const { value } = await send({ type: 'qritique:load', name: 'session' });
        return isSession(value) ? value : null;
      },
      async save(session) {
        await send({ type: 'qritique:save', name: 'session', value: session });
      },
      async capture() {
        return (await send({ type: 'qritique:capture' })).dataUrl;
      },
      async copyImage(dataUrl) {
        try {
          await copyImageLocally(dataUrl);
        } catch {
          await send({ type: 'qritique:copy-image', dataUrl });
        }
      },
      async copyText(text) {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          await send({ type: 'qritique:copy-text', text });
        }
      },
      async download(dataUrl, filename) {
        downloadLocally(dataUrl, filename);
      },
    };
    let active = false;
    let initial = emptySession();
    let ui: Awaited<ReturnType<typeof createShadowRootUi>> | undefined;
    const close = () => {
      ui?.remove();
      active = false;
    };
    const open = async () => {
      if (active || ctx.isInvalid) return;
      active = true;
      try {
        initial = (await bridge.load()) ?? emptySession(await bridge.loadPalette());
      } catch {
        initial = emptySession();
      }
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      ui = await createShadowRootUi(ctx, {
        name: 'qritique-overlay',
        position: 'overlay',
        anchor: 'body',
        zIndex: 2147483647,
        onMount(container) {
          const host = (container.getRootNode() as ShadowRoot).host as HTMLElement;
          const root = createRoot(container);
          root.render(<App host={host} bridge={bridge} initial={initial} onClose={close} />);
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      ui.mount();
    };
    const onMessage: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (
      message: Message,
      _sender,
      sendResponse,
    ) => {
      if (message.type === 'qritique:ping') {
        sendResponse({ ready: true });
        return;
      }
      if (message.type === 'qritique:toggle') {
        if (active) close();
        else void open();
        sendResponse({ active });
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    ctx.onInvalidated(() => {
      close();
      browser.runtime.onMessage.removeListener(onMessage);
    });
    // Injection follows a user action. Subsequent actions toggle the existing UI.
    await open();
  },
});
