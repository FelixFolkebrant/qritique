import { browser } from 'wxt/browser';
import { copyImageLocally } from '../../lib/bridge';
import { isClipboardMessage } from '../../lib/messages';
import type { Message } from '../../lib/types';

browser.runtime.onMessage.addListener(
  (message: Message & { target?: string }, sender, sendResponse) => {
    if (
      message?.target !== 'clipboard' ||
      sender.id !== browser.runtime.id ||
      sender.tab ||
      !isClipboardMessage(message)
    )
      return;
    void (async () => {
      for (let attempt = 0; attempt < 20 && !document.hasFocus(); attempt++) {
        window.focus();
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (message.type === 'qritique:copy-image') await copyImageLocally(message.dataUrl);
      else if (message.type === 'qritique:copy-text')
        await navigator.clipboard.writeText(message.text);
      return { ok: true };
    })().then(sendResponse, (error: unknown) =>
      sendResponse({
        error:
          error instanceof Error
            ? error.message
            : 'Clipboard unavailable. Shift-click Copy image to save a PNG.',
      }),
    );
    return true;
  },
);
