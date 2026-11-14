import type { Keybindings } from './keybindings';
import type { Session } from './types';

export interface Bridge {
  loadKeybindings(): Promise<Keybindings>;
  saveKeybindings(bindings: Keybindings): Promise<void>;
  load(): Promise<Session | null>;
  save(session: Session): Promise<void>;
  capture(): Promise<string>;
  copyImage(dataUrl: string): Promise<void>;
  copyText(text: string): Promise<void>;
  download(dataUrl: string, filename: string): Promise<void>;
}

export async function copyImageLocally(dataUrl: string) {
  const blob = await (await fetch(dataUrl)).blob();
  if (!navigator.clipboard?.write)
    throw new Error('Image clipboard is unavailable here. Shift-click Copy image to save a PNG.');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export function downloadLocally(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}
