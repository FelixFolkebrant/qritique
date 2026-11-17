import { browser } from 'wxt/browser';
import type { Keybindings } from './keybindings';
import type { Theme } from './theme';
import { isSession, type Session } from './types';

export type StorageName = 'session' | 'theme' | 'palette' | 'keybindings';
export type StorageMessage =
  | { type: 'qritique:load'; name: StorageName }
  | {
      type: 'qritique:save';
      name: StorageName;
      value: Session | Theme | string[] | Keybindings;
    };

export function storageKey(name: StorageName, senderUrl: string): string {
  const url = new URL(senderUrl);
  if (!['http:', 'https:', 'file:'].includes(url.protocol))
    throw new Error('Storage is only available to annotated websites.');
  if (name === 'session') return `qritique:${url.origin}${url.pathname}${url.search}`;
  if (!['theme', 'palette', 'keybindings'].includes(name))
    throw new Error('Unknown storage setting.');
  return `qritique:${name}`;
}

export async function handleStorage(message: StorageMessage, senderUrl: string) {
  const key = storageKey(message.name, senderUrl);
  if (message.type === 'qritique:load')
    return { value: (await browser.storage.local.get(key))[key] };
  if (message.name === 'session' && !isSession(message.value))
    throw new Error('Invalid annotation session.');
  await browser.storage.local.set({ [key]: message.value });
  return { ok: true };
}
