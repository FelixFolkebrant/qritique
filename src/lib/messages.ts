import type { Message } from './types';

type ClipboardMessage = Extract<Message, { type: 'qritique:copy-image' | 'qritique:copy-text' }>;
export const MAX_IMAGE_PIXELS = 16_000_000;

export function isClipboardMessage(value: unknown): value is ClipboardMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as ClipboardMessage;
  if (message.type === 'qritique:copy-text')
    return typeof message.text === 'string' && message.text.length <= 1_000_000;
  if (message.type !== 'qritique:copy-image' || typeof message.dataUrl !== 'string') return false;
  const prefix = 'data:image/png;base64,';
  if (
    message.dataUrl.length > 96 * 1024 * 1024 ||
    (message.dataUrl.length - prefix.length) % 4 !== 0 ||
    !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(message.dataUrl)
  )
    return false;
  const header = atob(message.dataUrl.slice(prefix.length, prefix.length + 44));
  if (header.length < 24 || header.slice(8, 16) !== '\0\0\0\rIHDR') return false;
  const bytes = Uint8Array.from(header, (character) => character.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 && width * height <= MAX_IMAGE_PIXELS;
}
