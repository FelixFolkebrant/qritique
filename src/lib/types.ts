export type Tool = 'select' | 'box' | 'polygon' | 'pencil' | 'brush' | 'inspect' | 'move';
export type Mode = 'color' | 'number';
export type Point = { x: number; y: number };
export type Bounds = { x: number; y: number; width: number; height: number };
export type Group = {
  id: string;
  kind: Mode;
  label: string;
  color: string;
  note: string;
};
export type ElementInfo = {
  selector: string;
  tag: string;
  text: string;
};
export type Annotation = {
  id: string;
  groupId: string;
  tool: Exclude<Tool, 'select' | 'inspect'> | 'element';
  points: Point[];
  bounds: Bounds;
  size: number;
  orientation?: 'horizontal' | 'vertical';
  element?: ElementInfo;
  delta?: Point;
};
export type Session = {
  version: 1;
  groups: Group[];
  annotations: Annotation[];
  mode: Mode;
  activeGroupId: string;
};
export type ExportScope = 'all' | 'number' | string;
export type Message =
  | { type: 'qritique:toggle' }
  | { type: 'qritique:ping' }
  | { type: 'qritique:capture' }
  | { type: 'qritique:copy-image'; dataUrl: string }
  | { type: 'qritique:copy-text'; text: string }
  | { type: 'qritique:download'; dataUrl: string; filename: string };

export const BASE_GROUPS: Group[] = [
  { id: 'blue', kind: 'color', label: 'Blue', color: '#164bff', note: '' },
  { id: 'red', kind: 'color', label: 'Red', color: '#ff2028', note: '' },
  { id: 'green', kind: 'color', label: 'Green', color: '#28c34e', note: '' },
  { id: 'number-1', kind: 'number', label: '1', color: '#ffffff', note: '' },
];

export function emptySession(): Session {
  return {
    version: 1,
    groups: BASE_GROUPS.map((group) => ({ ...group })),
    annotations: [],
    mode: 'color',
    activeGroupId: 'blue',
  };
}

export function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const session = value as Session;
  if (
    session.version !== 1 ||
    !Array.isArray(session.groups) ||
    !Array.isArray(session.annotations)
  )
    return false;
  const validGroups = session.groups.every(
    (g) =>
      g &&
      typeof g.id === 'string' &&
      typeof g.label === 'string' &&
      typeof g.note === 'string' &&
      typeof g.color === 'string' &&
      /^#[\da-f]{6}$/i.test(g.color) &&
      ['color', 'number'].includes(g.kind),
  );
  if (!validGroups || !session.groups.some((g) => g.kind === 'number')) return false;
  return (
    ['color', 'number'].includes(session.mode) &&
    session.groups.some((g) => g.id === session.activeGroupId) &&
    session.annotations.every(
      (a) =>
        a &&
        typeof a.id === 'string' &&
        session.groups.some((g) => g.id === a.groupId) &&
        ['box', 'polygon', 'pencil', 'brush', 'element', 'move'].includes(a.tool) &&
        Array.isArray(a.points) &&
        a.points.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)) &&
        a.bounds &&
        [a.bounds.x, a.bounds.y, a.bounds.width, a.bounds.height, a.size].every(Number.isFinite) &&
        a.bounds.width >= 0 &&
        a.bounds.height >= 0 &&
        a.size > 0 &&
        (!a.element ||
          (typeof a.element.selector === 'string' &&
            typeof a.element.tag === 'string' &&
            typeof a.element.text === 'string')) &&
        (!a.delta || (Number.isFinite(a.delta.x) && Number.isFinite(a.delta.y))),
    )
  );
}
