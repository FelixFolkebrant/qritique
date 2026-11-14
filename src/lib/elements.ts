import type { Bounds, ElementInfo, Point } from './types';

export function elementBounds(element: Element): Bounds {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + window.scrollX,
    y: rect.top + window.scrollY,
    width: rect.width,
    height: rect.height,
  };
}

export function describeElement(element: Element): ElementInfo {
  return {
    selector: selectorFor(element),
    tag: element.tagName.toLowerCase(),
    text: (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 100),
  };
}

export function selectorFor(element: Element): string {
  if (element.id && document.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1)
    return `#${CSS.escape(element.id)}`;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.documentElement) {
    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }
    const parent: Element | null = current.parentElement;
    const tag = current.tagName.toLowerCase();
    const siblings = parent
      ? [...parent.children].filter((s) => s.tagName === current?.tagName)
      : [];
    parts.unshift(
      `${tag}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : ''}`,
    );
    current = parent;
  }
  return parts.join(' > ');
}

export function resolveElement(selector: string): HTMLElement | null {
  try {
    return document.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

export function elementAt(point: Point, host: HTMLElement): HTMLElement | null {
  const previous = host.style.pointerEvents;
  host.style.setProperty('pointer-events', 'none', 'important');
  const element = document
    .elementsFromPoint(point.x, point.y)
    .find(
      (el) =>
        el !== host &&
        el !== document.documentElement &&
        el !== document.body &&
        !host.contains(el),
    );
  host.style.pointerEvents = previous;
  return element instanceof HTMLElement ? element : null;
}

// A translate preserves surrounding layout, unlike removing the element from flow.
export class ElementMoves {
  private originals = new Map<
    HTMLElement,
    {
      transform: string;
      priority: string;
      transition: string;
      transitionPriority: string;
      base: string;
    }
  >();

  move(element: HTMLElement, delta: Point) {
    if (!this.originals.has(element))
      this.originals.set(element, {
        transform: element.style.getPropertyValue('transform'),
        base:
          getComputedStyle(element).transform === 'none' ? '' : getComputedStyle(element).transform,
        priority: element.style.getPropertyPriority('transform'),
        transition: element.style.getPropertyValue('transition'),
        transitionPriority: element.style.getPropertyPriority('transition'),
      });
    const original = this.originals.get(element)!;
    element.style.setProperty('transition', 'none', 'important');
    element.style.setProperty(
      'transform',
      `translate(${delta.x}px, ${delta.y}px) ${original.base}`,
      'important',
    );
  }

  restore(element: HTMLElement) {
    const original = this.originals.get(element);
    if (!original) return;
    element.style.setProperty('transform', original.transform, original.priority);
    element.style.setProperty('transition', original.transition, original.transitionPriority);
    this.originals.delete(element);
  }

  restoreAll() {
    for (const element of this.originals.keys()) this.restore(element);
  }
}
