import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  defaultKeybindings,
  type Keybindings,
  SHORTCUTS,
  type ShortcutAction,
  shortcutActions,
  shortcutFromEvent,
  shortcutLabel,
} from '../lib/keybindings';
import { Button } from './Button';

export function KeybindingsDialog({
  bindings,
  onChange,
  onClose,
}: {
  bindings: Keybindings;
  onChange(bindings: Keybindings): void;
  onClose(): void;
}) {
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = dialog.current?.getRootNode() as ShadowRoot;
    const previous = root.activeElement as HTMLElement | null;
    dialog.current?.querySelector('button')?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="dialog-backdrop" data-qritique-ui="">
      <section
        ref={dialog}
        className="keybindings-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-label="Keybinds"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !recording) onClose();
          if (event.key === 'Tab') {
            const controls = [
              ...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input'),
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
          <h2>Keybinds</h2>
          <Button title="Close keybinds" aria-label="Close keybinds" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>
        <p>
          Click a shortcut, then press a new combination. Ctrl and ⌘ both work. Changes are saved on
          this device.
        </p>
        <div className="shortcut-list">
          {shortcutActions.map((action) => (
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
                    if (!key) return;
                    const conflict = shortcutActions.find(
                      (other) => other !== action && bindings[other].includes(key),
                    );
                    if (conflict) {
                      setError(`Already used for ${SHORTCUTS[conflict].label.toLowerCase()}.`);
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
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-footer">
          <span>Ctrl + scroll also adjusts stroke size.</span>
          <button
            type="button"
            onClick={() => {
              onChange(defaultKeybindings());
              setError('');
            }}
          >
            Reset defaults
          </button>
        </div>
      </section>
    </div>
  );
}
