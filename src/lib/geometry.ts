import type { Annotation, Bounds, Point } from './types';

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function boundsOf(points: Point[], padding = 0): Bounds {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs) - padding;
  const y = Math.min(...ys) - padding;
  return { x, y, width: Math.max(...xs) - x + padding, height: Math.max(...ys) - y + padding };
}

export function pathOf(points: Point[], close = false): string {
  return (
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + (close ? ' Z' : '')
  );
}

export function brushPath(points: Point[], size: number, orientation = 'horizontal'): string {
  const x = orientation === 'horizontal' ? size / 2 : 1;
  const y = orientation === 'vertical' ? size / 2 : 1;
  return points
    .map((p, i) => {
      const prev = points[i - 1] ?? p;
      const corners = [p, prev].flatMap((q) => [
        { x: q.x - x, y: q.y - y },
        { x: q.x + x, y: q.y - y },
        { x: q.x + x, y: q.y + y },
        { x: q.x - x, y: q.y + y },
      ]);
      return pathOf(convexHull(corners), true);
    })
    .join(' ');
}

function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0)
        out.pop();
      out.push(p);
    }
    return out;
  };
  const lower = half(sorted);
  const upper = half(sorted.reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function pointInPolygon(point: Point, points: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const len = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = len ? clamp(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len, 0, 1) : 0;
  return distance(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

export function hitTest(annotation: Annotation, point: Point): boolean {
  const { x, y, width, height } = annotation.bounds;
  if (point.x < x - 6 || point.x > x + width + 6 || point.y < y - 6 || point.y > y + height + 6)
    return false;
  if (annotation.tool === 'polygon') return pointInPolygon(point, annotation.points);
  if (annotation.tool === 'pencil' || annotation.tool === 'brush') {
    return annotation.points.some(
      (p, i) => segmentDistance(point, annotation.points[i - 1] ?? p, p) <= annotation.size / 2 + 5,
    );
  }
  return true;
}

export function translateAnnotation(annotation: Annotation, delta: Point): Annotation {
  return {
    ...annotation,
    points: annotation.points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })),
    bounds: {
      ...annotation.bounds,
      x: annotation.bounds.x + delta.x,
      y: annotation.bounds.y + delta.y,
    },
  };
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export function resizeHandleAt(annotation: Annotation, point: Point): ResizeHandle | null {
  if (annotation.tool !== 'box' || annotation.element) return null;
  const { x, y, width, height } = annotation.bounds;
  const left = Math.abs(point.x - x) <= 6;
  const right = Math.abs(point.x - x - width) <= 6;
  const top = Math.abs(point.y - y) <= 6;
  const bottom = Math.abs(point.y - y - height) <= 6;
  if (point.x < x - 6 || point.x > x + width + 6 || point.y < y - 6 || point.y > y + height + 6)
    return null;
  if (top && left) return 'nw';
  if (top && right) return 'ne';
  if (bottom && left) return 'sw';
  if (bottom && right) return 'se';
  if (top) return 'n';
  if (bottom) return 's';
  if (left) return 'w';
  if (right) return 'e';
  return null;
}

export function resizeBox(annotation: Annotation, handle: ResizeHandle, delta: Point): Annotation {
  const { x, y, width, height } = annotation.bounds;
  const start = {
    x: handle.includes('w') ? Math.min(x + delta.x, x + width - 3) : x,
    y: handle.includes('n') ? Math.min(y + delta.y, y + height - 3) : y,
  };
  const end = {
    x: handle.includes('e') ? Math.max(x + width + delta.x, x + 3) : x + width,
    y: handle.includes('s') ? Math.max(y + height + delta.y, y + 3) : y + height,
  };
  return { ...annotation, points: [start, end], bounds: boundsOf([start, end]) };
}
