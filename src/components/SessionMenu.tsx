import { Eye, EyeOff, Keyboard, Menu, Redo2, Trash2, Undo2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from './Button';

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  hasMarks: boolean;
  hidden: boolean;
  disabled: boolean;
  onClose(): void;
  onClear(): void;
  onUndo(): void;
  onRedo(): void;
  onHide(): void;
  onKeybindings(): void;
}

export function SessionMenu(props: Props) {
  const [open, setOpen] = useState(false);
  const pointerInside = useRef(false);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Pointer entry reveals the corner controls; focus reveals them for keyboard users.
    <div
      className="session-menu-zone"
      data-open={open}
      data-qritique-ui=""
      onPointerEnter={() => {
        pointerInside.current = true;
        setOpen(true);
      }}
      onPointerLeave={() => {
        pointerInside.current = false;
        setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!pointerInside.current && !event.currentTarget.contains(event.relatedTarget))
          setOpen(false);
      }}
    >
      <div className="session-menu-shell panel">
        <button
          type="button"
          className="session-menu-trigger"
          aria-label="Session menu"
          aria-expanded={open}
          tabIndex={open ? -1 : 0}
          onClick={() => setOpen(true)}
        >
          <Menu size={19} />
        </button>
        <div className="session-menu" role="toolbar" aria-label="Session actions" inert={!open}>
          <Button
            title={props.hidden ? 'Show markings' : 'Hide existing markings'}
            aria-label={props.hidden ? 'Show markings' : 'Hide existing markings'}
            active={props.hidden}
            disabled={props.disabled}
            onClick={props.onHide}
          >
            {props.hidden ? <EyeOff size={18} /> : <Eye size={18} />}
          </Button>
          <Button
            title="Keybinds"
            aria-label="Keybinds"
            disabled={props.disabled}
            onClick={props.onKeybindings}
          >
            <Keyboard size={19} />
          </Button>
          <span className="divider" />
          <Button
            title="Undo markings"
            aria-label="Undo markings"
            disabled={props.disabled || !props.canUndo}
            onClick={props.onUndo}
          >
            <Undo2 size={18} />
          </Button>
          <Button
            title="Redo markings"
            aria-label="Redo markings"
            disabled={props.disabled || !props.canRedo}
            onClick={props.onRedo}
          >
            <Redo2 size={18} />
          </Button>
          <span className="divider" />
          <Button
            title="Clear markings"
            aria-label="Clear markings"
            disabled={props.disabled || !props.hasMarks}
            onClick={props.onClear}
          >
            <Trash2 size={17} />
          </Button>
          <Button
            title="Close"
            aria-label="Close"
            disabled={props.disabled}
            onClick={props.onClose}
          >
            <X size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}
