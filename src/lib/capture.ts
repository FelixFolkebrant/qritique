import type { Bridge } from './bridge';
import { elementBounds, resolveElement } from './elements';
import { translateAnnotation } from './geometry';
import type { Annotation, Bounds } from './types';

const MAX_IMAGE_PIXELS = 16_000_000;

export function captureBounds(
  annotations: Annotation[],
  page: { width: number; height: number },
): Bounds {
  if (!annotations.length)
    throw new Error('Mark an area in the selected groups before exporting an image.');
  const bounds = annotations.flatMap((annotation) => {
    const { bounds, delta } = annotation;
    return annotation.tool === 'move' && delta
      ? [bounds, { ...bounds, x: bounds.x - delta.x, y: bounds.y - delta.y }]
      : [bounds];
  });
  const x = Math.max(0, Math.floor(Math.min(...bounds.map((b) => b.x)) - 48));
  const y = Math.max(0, Math.floor(Math.min(...bounds.map((b) => b.y)) - 48));
  const right = Math.min(page.width, Math.ceil(Math.max(...bounds.map((b) => b.x + b.width)) + 48));
  const bottom = Math.min(
    page.height,
    Math.ceil(Math.max(...bounds.map((b) => b.y + b.height)) + 48),
  );
  if (right <= x || bottom <= y) throw new Error('The selected marks are outside the page.');
  return { x, y, width: right - x, height: bottom - y };
}

function intersection(a: Bounds, b: Bounds): Bounds | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

function union(a: Bounds, b: Bounds): Bounds {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function subtract(area: Bounds, covered: Bounds): Bounds[] {
  const overlap = intersection(area, covered);
  if (!overlap) return [area];
  return [
    { ...area, height: overlap.y - area.y },
    {
      ...area,
      y: overlap.y + overlap.height,
      height: area.y + area.height - overlap.y - overlap.height,
    },
    { x: area.x, y: overlap.y, width: overlap.x - area.x, height: overlap.height },
    {
      x: overlap.x + overlap.width,
      y: overlap.y,
      width: area.x + area.width - overlap.x - overlap.width,
      height: overlap.height,
    },
  ].filter((bounds) => bounds.width > 0 && bounds.height > 0);
}

const readingOrder = (a: Bounds, b: Bounds) => a.y - b.y || a.x - b.x;

export function captureRegions(
  annotations: Annotation[],
  page: { width: number; height: number },
): Bounds[] {
  if (!annotations.length)
    throw new Error('Mark an area in the selected groups before exporting an image.');
  const regions: Bounds[] = [];
  for (const annotation of annotations) {
    let region = captureBounds([annotation], page);
    for (let i = 0; i < regions.length; ) {
      if (intersection(region, regions[i]!)) {
        region = union(region, regions.splice(i, 1)[0]!);
        i = 0;
      } else i++;
    }
    regions.push(region);
  }
  return regions.sort(readingOrder);
}

export function captureTiles(
  regions: Bounds[],
  page: { width: number; height: number },
  viewport: Bounds,
): Bounds[] {
  let remaining = [...regions];
  const tiles: Bounds[] = [];
  while (remaining.length) {
    remaining.sort(readingOrder);
    const first = remaining[0]!;
    let area = {
      ...first,
      width: Math.min(first.width, viewport.width),
      height: Math.min(first.height, viewport.height),
    };
    for (const bounds of remaining) {
      const combined = union(area, bounds);
      if (combined.width <= viewport.width && combined.height <= viewport.height) area = combined;
    }
    const fitsCurrent =
      area.x >= viewport.x &&
      area.y >= viewport.y &&
      area.x + area.width <= viewport.x + viewport.width &&
      area.y + area.height <= viewport.y + viewport.height;
    const tile = {
      ...viewport,
      x: fitsCurrent ? viewport.x : Math.min(area.x, Math.max(0, page.width - viewport.width)),
      y: fitsCurrent ? viewport.y : Math.min(area.y, Math.max(0, page.height - viewport.height)),
    };
    tiles.push(tile);
    if (tiles.length > 80)
      throw new Error('The selected areas are too large to capture in one image.');
    remaining = remaining.flatMap((bounds) => subtract(bounds, tile));
  }
  return tiles.sort((a, b) => {
    const aCurrent = a.x === viewport.x && a.y === viewport.y;
    const bCurrent = b.x === viewport.x && b.y === viewport.y;
    return Number(bCurrent) - Number(aCurrent) || readingOrder(a, b);
  });
}

const settle = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

export async function capturePage(bridge: Bridge, annotations: Annotation[], host: HTMLElement) {
  const original = { x: scrollX, y: scrollY, width: innerWidth, height: innerHeight };
  const page = {
    width: Math.max(document.documentElement.scrollWidth, innerWidth),
    height: Math.max(document.documentElement.scrollHeight, innerHeight),
  };
  const resolved = annotations.map((annotation) => {
    const element = annotation.element && resolveElement(annotation.element.selector);
    return element ? { ...annotation, bounds: elementBounds(element) } : annotation;
  });
  let outputY = 0;
  const sections = captureRegions(resolved, page).map((bounds) => {
    const section = { bounds, y: outputY };
    outputY += bounds.height + 24;
    return section;
  });
  const viewport = {
    x: 0,
    y: 0,
    width: Math.max(...sections.map(({ bounds }) => bounds.width)),
    height: outputY - 24,
  };
  const tiles = captureTiles(
    sections.map(({ bounds }) => bounds),
    page,
    original,
  );
  const scale = Math.min(
    devicePixelRatio,
    16384 / viewport.width,
    32760 / viewport.height,
    Math.sqrt(MAX_IMAGE_PIXELS / (viewport.width * viewport.height)),
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width * scale));
  canvas.height = Math.max(1, Math.floor(viewport.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create the image.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const floating: {
    element: HTMLElement;
    marked: boolean;
    visibility: string;
    priority: string;
  }[] = [];
  let unpainted = sections.map(({ bounds }) => [bounds]);
  try {
    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      if (element === host || host.contains(element)) continue;
      const position = getComputedStyle(element).position;
      if (position !== 'fixed' && position !== 'sticky') continue;
      const bounds = elementBounds(element);
      floating.push({
        element,
        marked: resolved.some((a) => {
          const selected = a.element && resolveElement(a.element.selector);
          return selected
            ? element === selected || element.contains(selected)
            : a.bounds.width <= bounds.width &&
                a.bounds.height <= bounds.height &&
                Boolean(intersection(a.bounds, bounds));
        }),
        visibility: element.style.getPropertyValue('visibility'),
        priority: element.style.getPropertyPriority('visibility'),
      });
    }
    if (
      floating.some((item) => item.marked) &&
      !tiles.some((tile) => tile.x === original.x && tile.y === original.y)
    )
      tiles.unshift(original);
    for (const tile of tiles) {
      if (!unpainted.some((areas) => areas.some((area) => intersection(area, tile)))) continue;
      window.scrollTo(tile.x, tile.y);
      for (const item of floating) {
        if (item.marked && tile.x === original.x && tile.y === original.y)
          item.element.style.setProperty('visibility', item.visibility, item.priority);
        else item.element.style.setProperty('visibility', 'hidden', 'important');
      }
      await settle();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const image = new Image();
      image.src = await bridge.capture();
      await image.decode();
      if (
        scrollX !== tile.x ||
        scrollY !== tile.y ||
        innerWidth !== original.width ||
        innerHeight !== original.height ||
        Math.max(document.documentElement.scrollWidth, innerWidth) !== page.width ||
        Math.max(document.documentElement.scrollHeight, innerHeight) !== page.height
      )
        throw new Error('The page changed while capturing. Please try again.');
      for (const [index, section] of sections.entries()) {
        for (const area of unpainted[index]!) {
          const clip = intersection(area, tile);
          if (!clip) continue;
          ctx.drawImage(
            image,
            ((clip.x - tile.x) * image.naturalWidth) / tile.width,
            ((clip.y - tile.y) * image.naturalHeight) / tile.height,
            (clip.width * image.naturalWidth) / tile.width,
            (clip.height * image.naturalHeight) / tile.height,
            (clip.x - section.bounds.x) * scale,
            (clip.y - section.bounds.y + section.y) * scale,
            clip.width * scale,
            clip.height * scale,
          );
        }
      }
      unpainted = unpainted.map((areas) => areas.flatMap((area) => subtract(area, tile)));
    }
    return {
      dataUrl: canvas.toDataURL('image/png'),
      viewport,
      annotations: resolved.map((annotation) => {
        const bounds = captureBounds([annotation], page);
        const section = sections.find(
          ({ bounds: region }) =>
            bounds.x >= region.x &&
            bounds.y >= region.y &&
            bounds.x + bounds.width <= region.x + region.width &&
            bounds.y + bounds.height <= region.y + region.height,
        )!;
        return translateAnnotation(annotation, {
          x: -section.bounds.x,
          y: section.y - section.bounds.y,
        });
      }),
    };
  } finally {
    for (const item of floating)
      item.element.style.setProperty('visibility', item.visibility, item.priority);
    window.scrollTo(original.x, original.y);
    await settle();
  }
}
