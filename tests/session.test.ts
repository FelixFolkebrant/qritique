import { describe, expect, it } from 'vitest';
import { normalizeSession } from '../src/lib/session';
import { type Annotation, emptySession } from '../src/lib/types';

const mark = (id: string, groupId: string): Annotation => ({
  id,
  groupId,
  tool: 'box',
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ],
  bounds: { x: 0, y: 0, width: 10, height: 10 },
  size: 24,
});

describe('numbered groups', () => {
  it('starts with just one empty numbered group and compacts old preallocated groups', () => {
    const session = emptySession();
    expect(session.groups.filter((g) => g.kind === 'number').map((g) => g.label)).toEqual(['1']);
    const first = session.groups[3]!;
    session.groups.push(
      { ...first, id: 'old-2', label: '2' },
      { ...first, id: 'old-3', label: '3', note: 'Keep this note' },
    );
    session.annotations = [mark('a', 'old-3')];
    const normalized = normalizeSession(session);
    expect(
      normalized.groups.filter((g) => g.kind === 'number').map((g) => [g.id, g.label, g.note]),
    ).toEqual([
      ['old-3', '1', 'Keep this note'],
      ['number-1', '2', ''],
    ]);
    expect(normalized.annotations[0]?.groupId).toBe('old-3');
  });

  it('removes an emptied numbered group and shifts the others without moving their notes', () => {
    const previous = emptySession();
    const first = previous.groups[3]!;
    previous.groups.push(
      ...[2, 3, 4, 5].map((n) => ({
        ...first,
        id: `number-${n}`,
        label: String(n),
        note: `Note ${n}`,
      })),
    );
    previous.mode = 'number';
    previous.activeGroupId = 'number-3';
    previous.annotations = [1, 2, 3, 4].map((n) => mark(`a${n}`, `number-${n}`));
    const next = normalizeSession(
      { ...previous, annotations: previous.annotations.filter((a) => a.groupId !== 'number-3') },
      previous,
    );
    expect(next.groups.filter((g) => g.kind === 'number').map((g) => [g.id, g.label])).toEqual([
      ['number-1', '1'],
      ['number-2', '2'],
      ['number-4', '3'],
      ['number-5', '4'],
    ]);
    expect(next.activeGroupId).toBe('number-4');
    expect(next.groups.find((g) => g.id === 'number-4')?.note).toBe('Note 4');
  });

  it('replaces the last emptied group with a clean pending number and supports no remaining colors', () => {
    const previous = emptySession();
    previous.mode = 'number';
    previous.activeGroupId = 'number-1';
    previous.groups[3]!.note = 'Removed group note';
    previous.annotations = [mark('a', 'number-1')];
    const next = normalizeSession(
      { ...previous, groups: previous.groups.filter((g) => g.kind === 'number'), annotations: [] },
      previous,
    );
    expect(next.groups).toHaveLength(1);
    expect(next.groups[0]).toMatchObject({ kind: 'number', label: '1', note: '' });
    expect(next.groups[0]?.id).not.toBe('number-1');
    expect(next.activeGroupId).toBe(next.groups[0]?.id);
  });
});
