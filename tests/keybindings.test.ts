import { expect, it } from 'vitest';
import { readKeybindings } from '../src/lib/keybindings';

it('reserves plain Escape for cancel when loading saved bindings', () => {
  const bindings = readKeybindings({
    cancel: ['q'],
    select: ['Escape', 'Mod+Escape', 'Shift+Escape'],
  });
  expect(bindings.cancel).toEqual(['Escape']);
  expect(bindings.select).toEqual(['Mod+Escape', 'Shift+Escape']);
});
