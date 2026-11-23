import { browser } from 'wxt/browser';
import { type Keybindings, shortcutActions } from './keybindings';
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
  const value: unknown = message.value;
  let valid = false;
  if (message.name === 'session') valid = isSession(value);
  else if (message.name === 'theme') valid = ['system', 'light', 'dark'].includes(value as string);
  else if (message.name === 'palette')
    valid =
      Array.isArray(value) &&
      value.length <= 5 &&
      value.every((color) => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color));
  else if (message.name === 'keybindings')
    valid =
      Boolean(value && typeof value === 'object' && !Array.isArray(value)) &&
      shortcutActions.every((action) => {
        const keys = (value as Keybindings)[action];
        return (
          Array.isArray(keys) &&
          keys.length <= 64 &&
          keys.every((shortcut) => typeof shortcut === 'string' && shortcut.length <= 100)
        );
      });
  if (!valid) throw new Error(`Invalid ${message.name} data.`);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 4 * 1024 * 1024)
    throw new Error('Saved feedback is too large. Remove some marks or notes and try again.');
  await browser.storage.local.set({ [key]: message.value });
  return { ok: true };
}
