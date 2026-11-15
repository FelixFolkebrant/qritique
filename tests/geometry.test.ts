import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  brushPath,
  hitTest,
  pointInPolygon,
  resizeBox,
  resizeHandleAt,
  translateAnnotation,
} from '../src/lib/geometry';
import type { Annotation } from '../src/lib/types';

const box: Annotation = {
  id: 'a',
  groupId: 'teal',
  tool: 'box',
  points: [
    { x: 40, y: 50 },
    { x: 100, y: 90 },
  ],
  bounds: { x: 40, y: 50, width: 60, height: 40 },
  size: 24,
};
describe('drawing geometry', () => {
  it('normalizes reversed box drags and includes stroke padding', () => {
    expect(
      boundsOf([
        { x: 100, y: 90 },
        { x: 40, y: 50 },
      ]),
    ).toEqual(box.bounds);
    expect(boundsOf([{ x: 10, y: 20 }], 5)).toEqual({ x: 5, y: 15, width: 10, height: 10 });
  });
  it('hit-tests polygon interiors rather than their bounding box', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ];
    expect(pointInPolygon({ x: 10, y: 10 }, triangle)).toBe(true);
    expect(
      hitTest(
        { ...box, tool: 'polygon', points: triangle, bounds: boundsOf(triangle) },
        { x: 90, y: 90 },
      ),
    ).toBe(false);
  });
  it('hit-tests pencil strokes using the distance to each segment', () => {
    const line = {
      ...box,
      tool: 'pencil' as const,
      size: 10,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
      bounds: { x: -5, y: -5, width: 110, height: 110 },
    };
    expect(hitTest(line, { x: 50, y: 53 })).toBe(true);
    expect(hitTest(line, { x: 10, y: 90 })).toBe(false);
  });
  it('translates points and bounds together without mutating the original', () => {
    const moved = translateAnnotation(box, { x: 17, y: -10 });
    expect(moved.bounds).toEqual({ x: 57, y: 40, width: 60, height: 40 });
    expect(moved.points[0]).toEqual({ x: 57, y: 40 });
    expect(box.bounds.x).toBe(40);
  });
  it('builds different flat nib footprints for each brush orientation', () => {
    const point = [{ x: 30, y: 40 }];
    expect(brushPath(point, 20, 'horizontal')).toContain('20,39');
    expect(brushPath(point, 20, 'vertical')).toContain('29,30');
  });
});

describe('box resizing', () => {
  it('finds corners and borders while leaving the interior movable', () => {
    expect(resizeHandleAt(box, { x: 42, y: 48 })).toBe('nw');
    expect(resizeHandleAt(box, { x: 70, y: 90 })).toBe('s');
    expect(resizeHandleAt(box, { x: 70, y: 70 })).toBeNull();
    expect(resizeHandleAt({ ...box, tool: 'element' }, { x: 40, y: 50 })).toBeNull();
  });
  it('resizes bottom/right borders even when the top-left point stays still', () => {
    const resized = resizeBox(box, 'se', { x: 30, y: 20 });
    expect(resized.bounds).toEqual({ x: 40, y: 50, width: 90, height: 60 });
    expect(resized.points).toEqual([
      { x: 40, y: 50 },
      { x: 130, y: 110 },
    ]);
  });
  it('keeps opposite edges anchored and prevents inverted boxes', () => {
    expect(resizeBox(box, 'nw', { x: 100, y: 100 }).bounds).toEqual({
      x: 97,
      y: 87,
      width: 3,
      height: 3,
    });
    expect(resizeBox(box, 'w', { x: -20, y: 50 }).bounds).toEqual({
      x: 20,
      y: 50,
      width: 80,
      height: 40,
    });
    expect(box.bounds).toEqual({ x: 40, y: 50, width: 60, height: 40 });
  });
});
