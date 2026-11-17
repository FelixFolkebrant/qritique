import { browser } from 'wxt/browser';
import type { Bridge } from './bridge';
import type { NoteEvent } from './note-editor';

export const extensionNoteEditor: NonNullable<Bridge['noteEditor']> = {
  url: browser.runtime.getURL('/notes.html'),
  connect(frame, receive) {
    const channelId = crypto.randomUUID();
    const port = browser.runtime.connect({ name: `qritique:note-host:${channelId}` });
    const channel = new MessageChannel();
    let ready = false;
    channel.port1.onmessage = ({ data }: MessageEvent<NoteEvent>) => {
      if (data.type === 'ready') ready = true;
      receive(data);
    };
    port.onMessage.addListener((message) => {
      if (message.type !== 'ready') return;
      frame.contentWindow?.postMessage(
        { type: 'qritique:note-channel', channelId },
        browser.runtime.getURL('/').slice(0, -1),
        [channel.port2],
      );
    });
    // Only the extension frame receives this capability. Never put it in the DOM
    // or send note contents through the website's window message listeners.
    const bootstrap = () =>
      frame.contentWindow?.postMessage(
        { type: 'qritique:note-connect', channelId },
        browser.runtime.getURL('/').slice(0, -1),
      );
    frame.addEventListener('load', bootstrap);
    return {
      update(state) {
        if (ready) channel.port1.postMessage(state);
      },
      dispose() {
        frame.removeEventListener('load', bootstrap);
        port.disconnect();
        channel.port1.close();
      },
    };
  },
};

export function connectNoteEditors() {
  const hosts = new Map<string, ReturnType<typeof browser.runtime.connect>>();
  browser.runtime.onConnect.addListener((port) => {
    const match = /^qritique:note-(host|frame):([\da-f-]{36})$/.exec(port.name);
    if (!match) return;
    const sender = port.sender;
    if (sender?.id !== browser.runtime.id || sender.tab?.id == null) {
      port.disconnect();
      return;
    }
    const key = `${sender.tab.id}:${match[2]}`;
    if (match[1] === 'host') {
      if (sender.frameId !== 0 || !sender.url || !/^(https?|file):/.test(sender.url)) {
        port.disconnect();
        return;
      }
      hosts.set(key, port);
      port.onDisconnect.addListener(() => hosts.delete(key));
    } else {
      const host = hosts.get(key);
      if (!host || sender.url !== browser.runtime.getURL('/notes.html')) {
        port.disconnect();
        return;
      }
      hosts.delete(key);
      host.onDisconnect.addListener(() => port.disconnect());
      port.onDisconnect.addListener(() => host.disconnect());
      port.onMessage.addListener((message) => {
        if (message.type === 'ready') host.postMessage({ type: 'ready' });
      });
      port.postMessage({ type: 'authorized' });
    }
  });
}
