import { useLayoutEffect, useRef } from 'react';
import { shortcutFromEvent } from '../lib/keybindings';
import type { NoteEvent, NoteState } from '../lib/note-editor';

export function NoteInput({
  state,
  receive,
}: {
  state: NoteState;
  receive(event: NoteEvent): void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const receiveRef = useRef(receive);
  receiveRef.current = receive;
  useLayoutEffect(() => {
    const input = textarea.current;
    if (!input) return;
    input.style.height = 'auto';
    const height = state.note ? Math.min(160, input.scrollHeight) : 46;
    input.style.height = `${height}px`;
    receiveRef.current({ type: 'resize', height });
  }, [state.note]);
  useLayoutEffect(() => {
    if (state.focus) textarea.current?.focus();
  }, [state.focus]);
  return (
    <textarea
      ref={textarea}
      aria-label="Note for selected group"
      placeholder="Add note"
      value={state.note}
      rows={1}
      spellCheck={false}
      onChange={(event) => {
        if (event.isTrusted)
          receive({ type: 'change', groupId: state.groupId, note: event.target.value });
      }}
      onBlur={() => receive({ type: 'blur' })}
      onKeyDown={(event) => {
        if (!event.isTrusted) return;
        const shortcut = shortcutFromEvent(event.nativeEvent);
        if (shortcut && state.closeShortcuts.includes(shortcut)) {
          event.preventDefault();
          receive({ type: 'close' });
        } else if (
          event.key === 'Escape' ||
          (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing)
        ) {
          event.preventDefault();
          event.stopPropagation();
          textarea.current?.blur();
        }
      }}
    />
  );
}
