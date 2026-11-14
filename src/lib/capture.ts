import type { Bridge } from './bridge';
import { elementBounds, resolveElement } from './elements';
import type { Annotation } from './types';

const settle = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Capture real browser pixels, including marks below the fold, without a DOM rasterizer. */
export async function capturePage(bridge: Bridge, annotations: Annotation[], host: HTMLElement) {
  const original = { x: scrollX, y: scrollY };
  const floating: {
    element: HTMLElement;
    top: number;
    left: number;
    visibility: string;
    priority: string;
  }[] = [];
  try {
    window.scrollTo(0, 0);
    await settle();
    const width = Math.max(document.documentElement.scrollWidth, innerWidth);
    const height = Math.max(document.documentElement.scrollHeight, innerHeight);
    const viewWidth = innerWidth;
    const viewHeight = innerHeight;
    const columns = Math.ceil(width / viewWidth);
    const rows = Math.ceil(height / viewHeight);
    if (columns * rows > 80)
      throw new Error('This page is too large to capture in one image. Try a shorter page.');
    const resolved = annotations.map((annotation) => {
      const element = annotation.element && resolveElement(annotation.element.selector);
      return element ? { ...annotation, bounds: elementBounds(element) } : annotation;
    });
    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      if (element === host || host.contains(element)) continue;
      const position = getComputedStyle(element).position;
      if (position === 'fixed' || position === 'sticky') {
        const bounds = elementBounds(element);
        floating.push({
          element,
          top: bounds.y,
          left: bounds.x,
          visibility: element.style.getPropertyValue('visibility'),
          priority: element.style.getPropertyPriority('visibility'),
        });
      }
    }
    const canvas = document.createElement('canvas');
    let ctx: CanvasRenderingContext2D | null = null;
    let scale = 1;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const targetX = column * viewWidth;
        const targetY = row * viewHeight;
        window.scrollTo(targetX, targetY);
        await settle();
        const x = scrollX;
        const y = scrollY;
        for (const item of floating) {
          const belongs =
            item.top >= targetY &&
            item.top < targetY + viewHeight &&
            item.left >= targetX &&
            item.left < targetX + viewWidth;
          if (belongs) item.element.style.setProperty('visibility', item.visibility, item.priority);
          else item.element.style.setProperty('visibility', 'hidden', 'important');
        }
        // Let the browser paint after scrolling; the background queues screenshot calls.
        await delay(100);
        const image = new Image();
        image.src = await bridge.capture();
        await image.decode();
        if (
          scrollX !== x ||
          scrollY !== y ||
          innerWidth !== viewWidth ||
          innerHeight !== viewHeight
        )
          throw new Error('The page moved while capturing. Please try again.');
        if (!ctx) {
          scale = Math.min(
            image.naturalWidth / viewWidth,
            16384 / width,
            32760 / height,
            Math.sqrt(100_000_000 / (width * height)),
          );
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Unable to create the image.');
        }
        const drawWidth = Math.min(viewWidth, width - targetX);
        const drawHeight = Math.min(viewHeight, height - targetY);
        const sourceScaleX = image.naturalWidth / viewWidth;
        const sourceScaleY = image.naturalHeight / viewHeight;
        ctx.drawImage(
          image,
          (targetX - x) * sourceScaleX,
          (targetY - y) * sourceScaleY,
          drawWidth * sourceScaleX,
          drawHeight * sourceScaleY,
          targetX * scale,
          targetY * scale,
          drawWidth * scale,
          drawHeight * scale,
        );
      }
    }
    return {
      dataUrl: canvas.toDataURL('image/png'),
      annotations: resolved,
      viewport: { width, height, x: 0, y: 0 },
    };
  } finally {
    for (const item of floating)
      item.element.style.setProperty('visibility', item.visibility, item.priority);
    window.scrollTo(original.x, original.y);
    await settle();
  }
}
