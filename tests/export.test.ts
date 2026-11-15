import { describe, expect, it } from 'vitest';
import { buildPrompt, inScope } from '../src/lib/export';
import { emptySession, isSession } from '../src/lib/types';

describe('feedback export', () => {
  it('keeps color notes and numbered notes distinct when filtering', () => {
    const session = emptySession();
    session.groups[0]!.note = 'Reduce the navigation spacing.';
    session.groups[1]!.note = 'Move this button to the left.';
    session.groups[3]!.note = 'Make the headline shorter.';
    const prompt = buildPrompt(session, ['teal'], 'https://example.com', 'Example');
    expect(prompt).toContain('Teal (#016471)');
    expect(prompt).toContain('Reduce the navigation spacing.');
    expect(prompt).not.toContain('Move this button');
    expect(prompt).not.toContain('Make the headline');
    const numbered = buildPrompt(session, ['number-1'], 'https://example.com', 'Example');
    expect(numbered).toContain('#1\nMake the headline shorter.');
    expect(numbered).not.toContain('Reduce the navigation');
    const combined = buildPrompt(session, ['teal', 'number-1'], 'https://example.com', 'Example');
    expect(combined).toContain('Reduce the navigation spacing.');
    expect(combined).toContain('Make the headline shorter.');
    expect(combined).not.toContain('Move this button');
    expect(inScope(session.groups[3]!, 'all')).toBe(true);
  });
  it('includes element selectors and move distances for an actionable prompt', () => {
    const session = emptySession();
    session.annotations.push({
      id: 'move-1',
      groupId: 'teal',
      tool: 'move',
      points: [],
      size: 24,
      bounds: { x: 20, y: 30, width: 100, height: 50 },
      delta: { x: -80, y: 12 },
      element: { selector: '#create', tag: 'button', text: 'Create' },
    });
    const prompt = buildPrompt(session, 'all', 'https://example.com', 'Example');
    expect(prompt).toContain('Element: #create — “Create”');
    expect(prompt).toContain('Move -80px horizontally and 12px vertically.');
    expect(prompt).not.toContain('Red (#');
  });
  it('validates saved sessions before restoring them', () => {
    expect(isSession(emptySession())).toBe(true);
    expect(isSession(null)).toBe(false);
    expect(isSession({ ...emptySession(), groups: [null] })).toBe(false);
    expect(isSession({ ...emptySession(), annotations: [null] })).toBe(false);
    expect(isSession({ ...emptySession(), version: 100 })).toBe(false);
    expect(isSession({ ...emptySession(), activeGroupId: 'missing' })).toBe(false);
  });
});
