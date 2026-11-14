import type { Group, Session } from './types';

export function newNumberGroup(): Group {
  return { id: crypto.randomUUID(), kind: 'number', label: '1', color: '#ffffff', note: '' };
}

export function normalizeSession(session: Session, previous?: Session): Session {
  const used = new Set(session.annotations.map((annotation) => annotation.groupId));
  const previouslyUsed = new Set(previous?.annotations.map((annotation) => annotation.groupId));
  const colors = session.groups.filter((group) => group.kind === 'color');
  const numbers = session.groups.filter((group) => group.kind === 'number');
  const populated = numbers.filter((group) => used.has(group.id));
  const empty = numbers.filter((group) => !used.has(group.id) && !previouslyUsed.has(group.id));
  const pending =
    empty.find((group) => group.id === session.activeGroupId) ?? empty[0] ?? newNumberGroup();
  const numbered = [...populated, pending].map((group, index) =>
    group.label === String(index + 1) ? group : { ...group, label: String(index + 1) },
  );
  const groups = [...colors, ...numbered];
  const oldIndex = numbers.findIndex((group) => group.id === session.activeGroupId);
  const active =
    groups.find((group) => group.id === session.activeGroupId) ??
    (session.mode === 'color' && colors[0]
      ? colors[0]
      : numbered[Math.min(Math.max(oldIndex, 0), numbered.length - 1)])!;
  return { ...session, groups, activeGroupId: active.id, mode: active.kind };
}
