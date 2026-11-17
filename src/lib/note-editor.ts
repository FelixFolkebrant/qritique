export type NoteState = {
  groupId: string;
  note: string;
  focus: number;
  theme: 'light' | 'dark';
  closeShortcuts: string[];
};

export type NoteEvent =
  | { type: 'ready' }
  | { type: 'change'; groupId: string; note: string }
  | { type: 'blur' }
  | { type: 'close' }
  | { type: 'resize'; height: number };

export type NoteConnection = {
  update(state: NoteState): void;
  dispose(): void;
};
