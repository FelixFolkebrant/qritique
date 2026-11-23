import { describe, expect, it } from 'vitest';
import { isClipboardMessage } from '../src/lib/messages';

describe('clipboard message validation', () => {
  it('accepts only bounded text and embedded PNG data', () => {
    expect(isClipboardMessage({ type: 'qritique:copy-text', text: '' })).toBe(true);
    expect(
      isClipboardMessage({
        type: 'qritique:copy-image',
        dataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC9sAAAAASUVORK5CYII=',
      }),
    ).toBe(true);
    for (const dataUrl of [
      'https://example.com/image.png',
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:image/png;base64,not-a-png',
      'data:image/png;base64,iVBORw0KGgo<script>',
    ])
      expect(isClipboardMessage({ type: 'qritique:copy-image', dataUrl })).toBe(false);
    for (const value of [null, 42, {}, { type: 'qritique:copy-text', text: 42 }])
      expect(isClipboardMessage(value)).toBe(false);
  });

  it('rejects PNG headers that exceed the export pixel budget before decoding the image', () => {
    const bytes = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC'),
      (character) => character.charCodeAt(0),
    );
    const view = new DataView(bytes.buffer);
    for (const width of [0, 16_000_001]) {
      view.setUint32(16, width);
      expect(
        isClipboardMessage({
          type: 'qritique:copy-image',
          dataUrl: `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`,
        }),
      ).toBe(false);
    }
  });
});
