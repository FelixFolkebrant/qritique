import '../../assets/style.css';
import './style.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { NoteInput } from '../../components/NoteInput';
import type { NoteEvent, NoteState } from '../../lib/note-editor';

type Port = ReturnType<typeof browser.runtime.connect>;

function Editor({ port }: { port: MessagePort }) {
  const [state, setState] = useState<NoteState | null>(null);
  useEffect(() => {
    const update = ({ data: next }: MessageEvent<NoteState>) =>
      setState((previous) =>
        previous?.groupId === next.groupId ? { ...next, note: previous.note } : next,
      );
    port.addEventListener('message', update);
    port.start();
    port.postMessage({ type: 'ready' });
    return () => port.removeEventListener('message', update);
  }, [port]);
  if (!state) return null;
  const receive = (event: NoteEvent) => {
    if (event.type === 'change') setState({ ...state, note: event.note });
    port.postMessage(event);
  };
  return (
    <div className="qritique-root" data-theme={state.theme}>
      <div className="note-panel">
        <NoteInput state={state} receive={receive} />
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
let connection: { port: Port; channelId: string } | undefined;
let authorized = false;
let connected = false;
window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return;
  if (connected) return;
  if (
    event.data?.type === 'qritique:note-channel' &&
    authorized &&
    event.data.channelId === connection?.channelId &&
    event.ports.length === 1
  ) {
    connected = true;
    connection?.port.disconnect();
    root.render(<Editor port={event.ports[0]!} />);
    return;
  }
  if (
    connection ||
    event.data?.type !== 'qritique:note-connect' ||
    typeof event.data.channelId !== 'string' ||
    !/^[\da-f-]{36}$/.test(event.data.channelId)
  )
    return;
  const port = browser.runtime.connect({ name: `qritique:note-frame:${event.data.channelId}` });
  connection = { port, channelId: event.data.channelId };
  port.onMessage.addListener((message) => {
    if (message.type !== 'authorized') return;
    authorized = true;
    port.postMessage({ type: 'ready' });
  });
  port.onDisconnect.addListener(() => {
    connection = undefined;
    authorized = false;
  });
});
