import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Bridge } from '../lib/bridge';
import type { NoteConnection, NoteEvent, NoteState } from '../lib/note-editor';
import { NoteInput } from './NoteInput';

export function NoteEditor({
  editor,
  state,
  receive,
}: {
  editor: Bridge['noteEditor'];
  state: NoteState;
  receive(event: NoteEvent): void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const connection = useRef<NoteConnection | null>(null);
  const latest = useRef({ state, receive });
  latest.current = { state, receive };
  const [height, setHeight] = useState(46);
  useLayoutEffect(() => {
    if (!editor || !frame.current) return;
    const port = editor.connect(frame.current, (event) => {
      if (event.type === 'ready') port.update(latest.current.state);
      else if (event.type === 'resize') setHeight(Math.max(46, Math.min(160, event.height)));
      else {
        if (event.type === 'blur') frame.current?.blur();
        latest.current.receive(event);
      }
    });
    connection.current = port;
    return () => {
      connection.current = null;
      port.dispose();
    };
  }, [editor]);
  useEffect(() => connection.current?.update(state), [state]);
  return editor ? (
    <iframe
      ref={frame}
      src={editor.url}
      title="Qritique note editor"
      className="note-editor-frame"
      style={{ height }}
    />
  ) : (
    <NoteInput state={state} receive={receive} />
  );
}
