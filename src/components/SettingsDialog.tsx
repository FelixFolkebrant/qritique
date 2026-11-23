import { Keyboard, Monitor, Moon, Plus, RotateCcw, Sun, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import wideLogo from '../assets/logo.svg?raw';
import {
  defaultKeybindings,
  type Keybindings,
  SHORTCUTS,
  type ShortcutAction,
  shortcutActions,
  shortcutCategories,
  shortcutFromEvent,
  shortcutLabel,
} from '../lib/keybindings';
import type { Theme } from '../lib/theme';
import { defaultPalette } from '../lib/types';
import { Button } from './Button';

export function SettingsDialog({
  theme,
  onThemeChange,
  palette,
  onPaletteChange,
  bindings,
  onChange,
  onClose,
}: {
  theme: Theme;
  onThemeChange(theme: Theme): void;
  palette: string[];
  onPaletteChange(colors: string[]): void;
  bindings: Keybindings;
  onChange(bindings: Keybindings): void;
  onClose(): void;
}) {
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [hotkey, setHotkey] = useState<string | null>(null);
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const colorInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = colorInput.current;
    if (!input) return;
    const addColor = () => {
      if (palette.length < 5) onPaletteChange([...palette, input.value]);
    };
    input.addEventListener('change', addColor);
    return () => input.removeEventListener('change', addColor);
  }, [palette, onPaletteChange]);
  const query = search.trim().toLowerCase().replaceAll(' ', '');
  const matchingActions = shortcutCategories
    .flatMap((category) => category.actions)
    .filter(
      (action) =>
        (!hotkey || bindings[action].includes(hotkey)) &&
        [SHORTCUTS[action].label, ...bindings[action].map(shortcutLabel)].some((value) =>
          value.toLowerCase().replaceAll(' ', '').includes(query),
        ),
    );
  useEffect(() => {
    const root = dialog.current?.getRootNode() as ShadowRoot;
    const previous = root.activeElement as HTMLElement | null;
    const scrollLock = document.createElement('style');
    scrollLock.textContent = 'html { overflow: hidden !important; }';
    document.head.append(scrollLock);
    dialog.current?.querySelector('button')?.focus();
    return () => {
      scrollLock.remove();
      previous?.focus();
    };
  }, []);
  return (
    <div className="dialog-backdrop" data-qritique-ui="">
      <section
        ref={dialog}
        className="settings-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onKeyDown={(event) => {
          if (shortcutFromEvent(event) === 'Escape') {
            event.preventDefault();
            if (recording) {
              setRecording(null);
              setError('');
              dialog.current?.querySelector('button')?.focus();
            } else onClose();
          }
          if (event.key === 'Tab') {
            const controls = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input:not([tabindex="-1"])',
              ),
            ];
            const first = controls[0];
            const last = controls[controls.length - 1];
            const focused = event.currentTarget.getRootNode() as ShadowRoot;
            if (event.shiftKey && focused.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && focused.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="dialog-heading">
          <span
            className="settings-logo"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: Static local SVG artwork.
            dangerouslySetInnerHTML={{
              __html: wideLogo.replaceAll('fill="white"', 'fill="currentColor"'),
            }}
          />
          <Button title="Close settings" aria-label="Close settings" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>
        <div className="settings-content">
          <div className="settings-preferences">
            <section className="settings-palette" aria-label="Palette">
              <div className="settings-preference-heading">
                <h3>Palette</h3>
                <Button
                  className="reset-palette"
                  title="Reset palette"
                  aria-label="Reset palette"
                  onClick={() => onPaletteChange(defaultPalette())}
                >
                  <RotateCcw size={14} />
                </Button>
              </div>
              <div className="settings-palette-colors">
                {palette.map((color, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Palette slots have no local state and colors are editable.
                  <div className="color-swatch" key={index}>
                    <label
                      className="color-button selected settings-color"
                      style={{ '--swatch': color } as React.CSSProperties}
                    >
                      <input
                        className="settings-color-input"
                        type="color"
                        aria-label={`Palette color ${index + 1}`}
                        value={color}
                        onChange={(event) =>
                          onPaletteChange(
                            palette.map((value, position) =>
                              position === index ? event.target.value : value,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="delete-color"
                      aria-label={`Remove palette color ${index + 1}`}
                      onClick={() =>
                        onPaletteChange(palette.filter((_, position) => position !== index))
                      }
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
                {palette.length < 5 && (
                  <button
                    className="add-color"
                    type="button"
                    aria-label="Add palette color"
                    title="Add palette color"
                    onClick={() => colorInput.current?.click()}
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
              <input
                className="hidden-color"
                ref={colorInput}
                type="color"
                aria-label="New palette color"
                defaultValue="#b14dff"
                tabIndex={-1}
              />
            </section>
            <section aria-labelledby="appearance-heading">
              <div className="settings-preference-heading">
                <h3 id="appearance-heading">Appearance</h3>
              </div>
              <fieldset className="theme-options" aria-label="Appearance" data-theme={theme}>
                <span className="theme-indicator" aria-hidden="true" />
                {(
                  [
                    { value: 'system', label: 'System', icon: Monitor },
                    { value: 'light', label: 'Light', icon: Sun },
                    { value: 'dark', label: 'Dark', icon: Moon },
                  ] as const
                ).map(({ value, label, icon: Icon }) => (
                  <button
                    type="button"
                    key={value}
                    aria-label={label}
                    title={label}
                    aria-pressed={theme === value}
                    onClick={() => onThemeChange(value)}
                  >
                    <Icon size={17} aria-hidden="true" />
                  </button>
                ))}
              </fieldset>
            </section>
          </div>
          <div className="settings-keybinds-heading">
            <h3>Keybinds</h3>
          </div>
          <div className="shortcut-search">
            <input
              ref={searchInput}
              type="search"
              aria-label="Search keybinds"
              placeholder="Search keybinds"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Backspace' && !search && hotkey) {
                  event.preventDefault();
                  setHotkey(null);
                }
              }}
            />
            {hotkey && !capturingHotkey && (
              <button
                type="button"
                className="hotkey-search-chip"
                aria-label={`Clear hotkey filter ${shortcutLabel(hotkey)}`}
                onClick={() => setHotkey(null)}
                onKeyDown={(event) => {
                  if (event.key === 'Backspace' || event.key === 'Delete') {
                    event.preventDefault();
                    setHotkey(null);
                  }
                }}
              >
                <span>{shortcutLabel(hotkey)}</span>
                <X size={13} />
              </button>
            )}
            {!hotkey && (
              <button
                type="button"
                className="hotkey-search-button"
                aria-label="Search by hotkey"
                title="Search by hotkey"
                aria-pressed={capturingHotkey}
                onClick={() => setCapturingHotkey((value) => !value)}
                onBlur={() => setCapturingHotkey(false)}
                onKeyDown={(event) => {
                  if (!capturingHotkey) return;
                  if (event.key === 'Tab') {
                    setCapturingHotkey(false);
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  const shortcut = shortcutFromEvent(event);
                  if (!shortcut || event.repeat) return;
                  if (shortcut !== 'Escape') {
                    setHotkey(shortcut);
                    searchInput.current?.focus();
                  }
                  setCapturingHotkey(false);
                }}
              >
                {capturingHotkey ? 'Press keybind' : <Keyboard size={17} />}
              </button>
            )}
          </div>
          <div className="shortcut-list">
            {matchingActions.length === 0 && <p>No matching keybinds.</p>}
            {shortcutCategories.map((category) => {
              const actions = category.actions.filter((action) => matchingActions.includes(action));
              if (!actions.length) return null;
              return (
                <section
                  className="shortcut-category"
                  key={category.label}
                  aria-label={category.label}
                >
                  <h3>{category.label}</h3>
                  {actions.map((action) => (
                    <div className="shortcut-row" key={action}>
                      <label htmlFor={`shortcut-${action}`}>{SHORTCUTS[action].label}</label>
                      <div className="shortcut-binding">
                        <input
                          id={`shortcut-${action}`}
                          aria-label={SHORTCUTS[action].label}
                          readOnly
                          value={
                            recording === action
                              ? 'Press keys…'
                              : bindings[action][0]
                                ? shortcutLabel(bindings[action][0])
                                : 'Unassigned'
                          }
                          onFocus={() => {
                            setRecording(action);
                            setError('');
                          }}
                          onBlur={() => setRecording(null)}
                          onKeyDown={(event) => {
                            if (event.key === 'Tab') return;
                            event.preventDefault();
                            event.stopPropagation();
                            const key = shortcutFromEvent(event);
                            if (key === 'Escape') {
                              setRecording(null);
                              setError('');
                              dialog.current?.querySelector('button')?.focus();
                              return;
                            }
                            if (!key) return;
                            const conflict = shortcutActions.find(
                              (other) => other !== action && bindings[other].includes(key),
                            );
                            if (conflict) {
                              setError(
                                `Already used for ${SHORTCUTS[conflict].label.toLowerCase()}.`,
                              );
                              return;
                            }
                            onChange({ ...bindings, [action]: [key] });
                            setError('');
                            dialog.current?.querySelector('button')?.focus();
                          }}
                        />
                        {bindings[action].length > 1 && recording !== action && (
                          <span className="shortcut-alternates">
                            Also {bindings[action].slice(1).map(shortcutLabel).join(' / ')}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="unbind-button"
                        aria-label={`Unassign ${SHORTCUTS[action].label.toLowerCase()}`}
                        disabled={!bindings[action].length}
                        onClick={() => onChange({ ...bindings, [action]: [] })}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-footer">
          <button
            type="button"
            onClick={() => {
              onChange(defaultKeybindings());
              setError('');
            }}
          >
            Reset keybinds
          </button>
        </div>
      </section>
    </div>
  );
}
