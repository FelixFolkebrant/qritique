export const SHORTCUTS = {
  select: { label: 'Selector', keys: ['v'] },
  box: { label: 'Box', keys: ['r'] },
  polygon: { label: 'Polygon', keys: ['l'] },
  pencil: { label: 'Pencil', keys: ['p'] },
  brush: { label: 'Brush', keys: ['b'] },
  inspect: { label: 'Inspect element', keys: ['i'] },
  move: { label: 'Move element', keys: ['m'] },
  undo: { label: 'Undo markings', keys: ['Mod+z'] },
  redo: { label: 'Redo markings', keys: ['Mod+Shift+z', 'Mod+y'] },
  delete: { label: 'Delete selected mark', keys: ['Delete', 'Backspace'] },
  finish: { label: 'Finish polygon', keys: ['Enter'] },
  cancel: { label: 'Cancel / close', keys: ['Escape'] },
  smaller: { label: 'Decrease stroke size', keys: ['['] },
  larger: { label: 'Increase stroke size', keys: [']'] },
  parent: { label: 'Inspect parent', keys: ['ArrowUp'] },
  child: { label: 'Inspect child', keys: ['ArrowDown'] },
  numbers: { label: 'Toggle numbered notes', keys: ['#'] },
  hide: { label: 'Hide / show existing markings', keys: ['h'] },
  clear: { label: 'Clear markings', keys: [] },
  keybindings: { label: 'Open keybinds', keys: ['?'] },
} satisfies Record<string, { label: string; keys: string[] }>;

export type ShortcutAction = keyof typeof SHORTCUTS;
export type Keybindings = Record<ShortcutAction, string[]>;
export const shortcutActions = Object.keys(SHORTCUTS) as ShortcutAction[];
export const defaultKeybindings = (): Keybindings =>
  Object.fromEntries(
    shortcutActions.map((action) => [action, [...SHORTCUTS[action].keys]]),
  ) as Keybindings;

export function readKeybindings(value: unknown): Keybindings {
  const bindings = defaultKeybindings();
  if (!value || typeof value !== 'object') return bindings;
  for (const action of shortcutActions) {
    const keys = (value as Record<string, unknown>)[action];
    if (Array.isArray(keys) && keys.every((key) => typeof key === 'string'))
      bindings[action] = keys;
  }
  return bindings;
}

export function shortcutFromEvent(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
): string | null {
  if (['Control', 'Meta', 'Alt', 'Shift', 'Dead', 'Unidentified'].includes(event.key)) return null;
  const key =
    event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return [
    event.ctrlKey || event.metaKey ? 'Mod' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey && (key.length > 1 || /[a-z]/.test(key)) ? 'Shift' : '',
    key,
  ]
    .filter(Boolean)
    .join('+');
}

export function shortcutLabel(shortcut: string): string {
  return shortcut
    .replace('Mod+', 'Ctrl / ⌘ + ')
    .replaceAll('+', ' + ')
    .replace(/\s+/g, ' ')
    .replace(/\b[a-z]\b/g, (key) => key.toUpperCase());
}
