import { describe, expect, it } from 'vitest';
import { captureBounds, captureRegions, captureTiles } from '../src/lib/capture';
import type { Annotation, Bounds } from '../src/lib/types';

const page = { width: 1200, height: 8000 };
const mark = (bounds: Bounds, extra: Partial<Annotation> = {}): Annotation => ({
  id: 'mark',
  groupId: 'teal',
  tool: 'box',
  points: [],
  size: 24,
  bounds,
  ...extra,
});

describe('marked image bounds', () => {
  it('includes context around distant marks without including the whole page', () => {
    expect(
      captureBounds(
        [
          mark({ x: 70, y: 120, width: 330, height: 180 }),
          mark({ x: 70, y: 1520, width: 330, height: 180 }),
        ],
        page,
      ),
    ).toEqual({ x: 22, y: 72, width: 426, height: 1676 });
  });

  it('clamps the buffer to the document edges and rounds outward', () => {
    expect(captureBounds([mark({ x: 10.5, y: 7900.5, width: 1180, height: 90 })], page)).toEqual({
      x: 0,
      y: 7852,
      width: 1200,
      height: 148,
    });
  });

  it('keeps the original and proposed positions of a moved element', () => {
    expect(
      captureBounds(
        [
          mark(
            { x: 200, y: 400, width: 100, height: 50 },
            { tool: 'move', delta: { x: 120, y: -80 } },
          ),
        ],
        page,
      ),
    ).toEqual({ x: 32, y: 352, width: 316, height: 226 });
  });

  it('requires an on-page mark instead of silently capturing an unmarked page', () => {
    expect(() => captureBounds([], page)).toThrow('Mark an area');
    expect(() => captureBounds([mark({ x: 2000, y: 9000, width: 10, height: 10 })], page)).toThrow(
      'outside the page',
    );
  });

  it('merges overlapping context regions while keeping distant sections separate', () => {
    expect(
      captureRegions(
        [
          mark({ x: 70, y: 120, width: 330, height: 180 }),
          mark({ x: 350, y: 200, width: 100, height: 80 }),
          mark({ x: 70, y: 1520, width: 330, height: 180 }),
        ],
        page,
      ),
    ).toEqual([
      { x: 22, y: 72, width: 476, height: 276 },
      { x: 22, y: 1472, width: 426, height: 276 },
    ]);
  });
});

describe('viewport capture planning', () => {
  const viewport = { x: 0, y: 1300, width: 1200, height: 800 };
  it('captures only two screens for distant marks, starting with the current screen', () => {
    const regions = [
      { x: 22, y: 72, width: 426, height: 276 },
      { x: 22, y: 1472, width: 426, height: 276 },
    ];
    expect(captureTiles(regions, page, viewport)).toEqual([viewport, { ...viewport, x: 0, y: 72 }]);
  });
  it('uses one screenshot for nearby marks even when the current screen only covers one', () => {
    expect(
      captureTiles(
        [
          { x: 100, y: 200, width: 100, height: 100 },
          { x: 1150, y: 250, width: 100, height: 100 },
        ],
        { width: 2400, height: 8000 },
        { ...viewport, y: 0 },
      ),
    ).toEqual([{ ...viewport, x: 100, y: 200 }]);
  });
  it('avoids an extra screenshot when a small mark crosses an arbitrary screen boundary', () => {
    expect(
      captureTiles(
        [{ x: 1100, y: 750, width: 200, height: 200 }],
        { width: 2400, height: 8000 },
        { ...viewport, y: 0 },
      ),
    ).toEqual([{ ...viewport, x: 1100, y: 750 }]);
  });
  it('tiles a large region and clamps captures at the document edges', () => {
    expect(captureTiles([{ x: 50, y: 6500, width: 1100, height: 1500 }], page, viewport)).toEqual([
      { ...viewport, x: 0, y: 6500 },
      { ...viewport, x: 0, y: 7200 },
    ]);
  });
  it('reuses captured pixels for overlapping regions and rejects excessive capture jobs', () => {
    expect(
      captureTiles(
        [
          { x: 50, y: 100, width: 1100, height: 1500 },
          { x: 50, y: 1000, width: 1100, height: 700 },
        ],
        page,
        { ...viewport, y: 0 },
      ),
    ).toHaveLength(2);
    expect(() =>
      captureTiles(
        [{ x: 0, y: 0, width: 1200, height: 100000 }],
        { width: 1200, height: 100000 },
        viewport,
      ),
    ).toThrow('too large');
  });
});
