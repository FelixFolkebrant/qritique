import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Bridge } from '../lib/bridge';
import { capturePage } from '../lib/capture';
import {
  describeElement,
  ElementMoves,
  elementAt,
  elementBounds,
  resolveElement,
} from '../lib/elements';
import { buildPrompt, composeImage } from '../lib/export';
import { freezePage } from '../lib/freeze';
import {
  boundsOf,
  clamp,
  distance,
  hitTest,
  pathOf,
  type ResizeHandle,
  resizeBox,
  resizeHandleAt,
  translateAnnotation,
} from '../lib/geometry';
import {
  defaultKeybindings,
  type Keybindings,
  shortcutActions,
  shortcutFromEvent,
} from '../lib/keybindings';
import { newNumberGroup, normalizeSession } from '../lib/session';
import type { Theme } from '../lib/theme';
import {
  type Annotation,
  defaultPalette,
  type ExportScope,
  type Group,
  type Point,
  type Session,
  type Tool,
} from '../lib/types';
import { Mark } from './Marks';
import { SessionMenu } from './SessionMenu';
import { SettingsDialog } from './SettingsDialog';
import { type Menu, Toolbar } from './Toolbar';

interface Props {
  host: HTMLElement;
  bridge: Bridge;
  initial: Session;
  onClose(): void;
}
type Gesture = {
  annotation: Annotation;
  start: Point;
  element?: HTMLElement;
  baseDelta?: Point;
  original?: Annotation;
  resize?: ResizeHandle;
};

export function App({ host, bridge, initial, onClose }: Props) {
  const [session, setSession] = useState(() => normalizeSession(initial));
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const history = useRef<{ past: Session[]; future: Session[] }>({ past: [], future: [] });
  const [tool, setToolState] = useState<Tool>('box');
  const [newNumberSelected, setNewNumberSelected] = useState(false);
  const newNumberSelectedRef = useRef(newNumberSelected);
  newNumberSelectedRef.current = newNumberSelected;
  const noteSelection = useRef<{ noteId: string; previousId: string } | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [size, setSize] = useState(24);
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [groupMenu, setGroupMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('system');
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const [palette, setPalette] = useState(defaultPalette);
  const [keybindings, setKeybindings] = useState<Keybindings>(defaultKeybindings);
  const [resizeCursor, setResizeCursor] = useState<ResizeHandle | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraftState] = useState<Annotation | null>(null);
  const draftRef = useRef<Annotation | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [hovered, setHovered] = useState<HTMLElement | null>(null);
  const hoveredRef = useRef<HTMLElement | null>(null);
  const descendants = useRef<HTMLElement[]>([]);
  const [viewport, setViewport] = useState({
    x: scrollX,
    y: scrollY,
    width: innerWidth,
    height: innerHeight,
    revision: 0,
  });
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState<'image' | 'notes' | null>(null);
  const [focusNote, setFocusNote] = useState(0);
  const [noteGroupId, setNoteGroupId] = useState<string | null>(null);
  const latestGroupId = useRef(session.activeGroupId);
  const [exporting, setExporting] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>('all');
  const captureLock = useRef(false);
  const moves = useRef(new ElementMoves());
  const uiRoot = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const activeGroup =
    session.groups.find((g) => g.id === session.activeGroupId) ?? session.groups[0]!;

  const update = useCallback((next: Session | ((previous: Session) => Session), record = true) => {
    const previous = sessionRef.current;
    const value = normalizeSession(
      typeof next === 'function' ? next(previous) : next,
      record ? previous : undefined,
    );
    if (record) {
      history.current.past = [...history.current.past.slice(-79), previous];
      history.current.future = [];
    }
    sessionRef.current = value;
    setSession(value);
  }, []);
  const setDraft = (value: Annotation | null) => {
    draftRef.current = value;
    setDraftState(value);
  };
  const setTool = (next: Tool) => {
    cancel();
    setHovered(null);
    hoveredRef.current = null;
    setSelectedId(null);
    setGroupMenu(false);
    setToolState(next);
  };
  const selectGroup = (group: Group) => {
    setNewNumberSelected(false);
    latestGroupId.current = group.id;
    setNoteGroupId(null);
    update((s) => ({ ...s, mode: group.kind, activeGroupId: group.id }), false);
  };
  const assignGroup = (group: Group) => {
    latestGroupId.current = group.id;
    setNoteGroupId(null);
    if (sessionRef.current.annotations.some((a) => a.id === selectedId && a.groupId !== group.id))
      update((s) => ({
        ...s,
        annotations: s.annotations.map((a) =>
          a.id === selectedId ? { ...a, groupId: group.id } : a,
        ),
        mode: group.kind,
        activeGroupId: group.id,
      }));
    setGroupMenu(false);
  };
  const addNumber = (annotationId?: string) => {
    const s = sessionRef.current;
    const group = s.groups.find(
      (g) => g.kind === 'number' && !s.annotations.some((a) => a.groupId === g.id),
    )!;
    if (annotationId) {
      latestGroupId.current = group.id;
      setNoteGroupId(null);
      update({
        ...s,
        annotations: s.annotations.map((a) =>
          a.id === annotationId ? { ...a, groupId: group.id } : a,
        ),
        activeGroupId: group.id,
        mode: 'number',
      });
    } else {
      selectGroup(group);
      setNewNumberSelected(true);
    }
    setGroupMenu(false);
  };
  const removeColor = (id: string) => {
    cancel();
    update((s) => ({
      ...s,
      groups: s.groups.filter((g) => g.id !== id),
      annotations: s.annotations.filter((a) => a.groupId !== id),
    }));
    setSelectedId(null);
    setGroupMenu(false);
  };
  const commit = (annotation: Annotation) => {
    latestGroupId.current = annotation.groupId;
    setNoteGroupId(null);
    update((s) => {
      const annotations = [...s.annotations.filter((a) => a.id !== annotation.id), annotation];
      const isNew = !s.annotations.some((a) => a.id === annotation.id);
      const numbers = s.groups.filter((g) => g.kind === 'number');
      const index = numbers.findIndex((g) => g.id === annotation.groupId);
      if (!isNew || index < 0) return { ...s, annotations };
      const next = numbers[index + 1] ?? newNumberGroup();
      return {
        ...s,
        annotations,
        groups: numbers[index + 1] ? s.groups : [...s.groups, next],
        activeGroupId: next.id,
        mode: 'number',
      };
    });
    setHiddenIds((ids) => {
      if (!ids.has(annotation.id)) return ids;
      const next = new Set(ids);
      next.delete(annotation.id);
      return next;
    });
    if (sessionRef.current.mode === 'number')
      setNewNumberSelected(
        !sessionRef.current.annotations.some((a) => a.groupId === sessionRef.current.activeGroupId),
      );
    setSelectedId(annotation.id);
    setDraft(null);
    gesture.current = null;
  };
  const finishPolygon = () => {
    if (draftRef.current?.tool === 'polygon' && draftRef.current.points.length >= 3)
      commit(draftRef.current);
  };
  const removeSelected = () => {
    if (!selectedId) return;
    setNoteGroupId(null);
    cancel();
    setGroupMenu(false);
    update((s) => ({ ...s, annotations: s.annotations.filter((a) => a.id !== selectedId) }));
    setSelectedId(null);
  };
  const undo = (redo = false) => {
    cancel();
    const stacks = history.current;
    const next = redo ? stacks.future.pop() : stacks.past.pop();
    if (!next) return;
    if (redo) stacks.past.push(sessionRef.current);
    else stacks.future.push(sessionRef.current);
    const notes = new Map(sessionRef.current.groups.map((group) => [group.id, group.note]));
    update(
      {
        ...next,
        groups: next.groups.map((group) => ({ ...group, note: notes.get(group.id) ?? group.note })),
      },
      false,
    );
    setDraft(null);
    gesture.current = null;
    setSelectedId(null);
    setGroupMenu(false);
  };
  const clearMarks = () => {
    setNoteGroupId(null);
    cancel();
    if (sessionRef.current.annotations.length) update((s) => ({ ...s, annotations: [] }));
    setSelectedId(null);
    setGroupMenu(false);
  };
  const toggleHidden = () => {
    cancel();
    setHiddenIds((ids) =>
      ids.size ? new Set() : new Set(sessionRef.current.annotations.map((a) => a.id)),
    );
    setSelectedId(null);
    setGroupMenu(false);
  };
  const changeTheme = (value: Theme) => {
    setTheme(value);
    void bridge.saveTheme(value).catch(() => setNotice('Unable to save theme locally.'));
  };
  const changePalette = (colors: string[]) => {
    setPalette(colors);
    void bridge.savePalette(colors).catch(() => setNotice('Unable to save palette locally.'));
  };
  const changeKeybindings = (bindings: Keybindings) => {
    setKeybindings(bindings);
    void bridge
      .saveKeybindings(bindings)
      .catch(() => setNotice('Unable to save keybinds locally.'));
  };

  useEffect(() => {
    let mounted = true;
    void bridge
      .loadTheme()
      .then((value) => {
        if (mounted) setTheme(value);
      })
      .catch(() => setNotice('Unable to load theme.'));
    void bridge
      .loadPalette()
      .then((colors) => {
        if (mounted) setPalette(colors);
      })
      .catch(() => setNotice('Unable to load palette.'));
    void bridge
      .loadKeybindings()
      .then((bindings) => {
        if (mounted) setKeybindings(bindings);
      })
      .catch(() => setNotice('Unable to load keybinds.'));
    return () => {
      mounted = false;
    };
  }, [bridge]);

  useEffect(() => {
    const preference = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(preference.matches);
    preference.addEventListener('change', update);
    update();
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const thaw = freezePage(host);
    const moveManager = moves.current;
    return () => {
      thaw();
      moveManager.restoreAll();
    };
  }, [host]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void bridge.save(session).catch(() => setNotice('Unable to save notes locally.'));
    }, 250);
    return () => clearTimeout(timer);
  }, [session, bridge]);
  useEffect(
    () => () => {
      void bridge.save(sessionRef.current).catch(() => {});
    },
    [bridge],
  );
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setViewport((v) => ({
          x: scrollX,
          y: scrollY,
          width: innerWidth,
          height: innerHeight,
          revision: v.revision + 1,
        })),
      );
    };
    window.addEventListener('scroll', refresh, true);
    window.addEventListener('resize', refresh);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', refresh, true);
      window.removeEventListener('resize', refresh);
    };
  }, []);
  useLayoutEffect(() => {
    moves.current.restoreAll();
    for (const annotation of session.annotations) {
      if (annotation.tool === 'move' && annotation.element && annotation.delta) {
        const element = resolveElement(annotation.element.selector);
        if (element) moves.current.move(element, annotation.delta);
      }
    }
    setViewport((v) => ({ ...v, revision: v.revision + 1 }));
  }, [session.annotations]);

  const freshAnnotations = session.annotations.map((a) => {
    if (!a.element) return a;
    const element = resolveElement(a.element.selector);
    return element ? { ...a, bounds: elementBounds(element) } : a;
  });
  const visibleAnnotations = freshAnnotations.filter((a) => !hiddenIds.has(a.id));
  const selectedAnnotation = visibleAnnotations.find((a) => a.id === selectedId);
  const selected = selectedAnnotation && draft?.id === selectedId ? draft : selectedAnnotation;
  const selectedGroup = session.groups.find((g) => g.id === selected?.groupId);
  const markedGroupIds = new Set(session.annotations.map((annotation) => annotation.groupId));
  const visibleGroups = session.groups.filter(
    (group) =>
      group.kind === 'color' ||
      group.label === '1' ||
      markedGroupIds.has(group.id) ||
      group.id === draft?.groupId,
  );
  const toDocument = (event: { clientX: number; clientY: number }): Point => ({
    x: event.clientX + scrollX,
    y: event.clientY + scrollY,
  });
  const newAnnotation = (nextTool: Annotation['tool'], point: Point): Annotation => ({
    id: crypto.randomUUID(),
    groupId: sessionRef.current.activeGroupId,
    tool: nextTool,
    points: [point],
    bounds: boundsOf([point]),
    size,
    orientation,
  });
  const updateHovered = useCallback((element: HTMLElement | null) => {
    hoveredRef.current = element;
    setHovered(element);
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || exporting) return;
    const focused = host.shadowRoot?.activeElement ?? document.activeElement;
    if (focused instanceof HTMLElement) focused.blur();
    event.preventDefault();
    if (groupMenu) {
      setGroupMenu(false);
      return;
    }
    if (menu) {
      setMenu(null);
      return;
    }
    const point = toDocument(event);
    if (tool === 'select') {
      const handle = selected ? resizeHandleAt(selected, point) : null;
      const hit = handle
        ? selected
        : [...visibleAnnotations].reverse().find((a) => hitTest(a, point));
      setSelectedId(hit?.id ?? null);
      const group = session.groups.find((g) => g.id === hit?.groupId);
      if (group) selectGroup(group);
      if (hit?.tool === 'move' && hit.element && hit.delta) {
        const element = resolveElement(hit.element.selector);
        if (element) {
          gesture.current = { annotation: hit, start: point, element, baseDelta: hit.delta };
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      } else if (hit && !hit.element) {
        gesture.current = {
          annotation: hit,
          start: point,
          original: hit,
          resize: handle ?? resizeHandleAt(hit, point) ?? undefined,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (tool === 'inspect' || tool === 'move') {
      const element = hoveredRef.current ?? elementAt({ x: event.clientX, y: event.clientY }, host);
      if (!element) return;
      const bounds = elementBounds(element);
      const info = describeElement(element);
      if (tool === 'inspect') {
        commit({ ...newAnnotation('element', point), bounds, element: info });
        return;
      }
      const existing = session.annotations.find(
        (a) => a.tool === 'move' && a.element?.selector === info.selector,
      );
      const annotation = existing ?? {
        ...newAnnotation('move', point),
        bounds,
        element: info,
        delta: { x: 0, y: 0 },
      };
      gesture.current = { annotation, start: point, element, baseDelta: annotation.delta };
      setDraft(annotation);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === 'polygon') {
      const current = draftRef.current;
      if (current?.tool === 'polygon') {
        if (current.points.length >= 3 && distance(point, current.points[0]!) < 10) {
          finishPolygon();
          return;
        }
        if (event.detail > 1) {
          finishPolygon();
          return;
        }
        const points = [...current.points, point];
        setDraft({ ...current, points, bounds: boundsOf(points) });
      } else {
        setSelectedId(null);
        setDraft(newAnnotation('polygon', point));
      }
      return;
    }
    const annotation = newAnnotation(tool, point);
    setSelectedId(null);
    gesture.current = { annotation, start: point };
    setDraft(annotation);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = toDocument(event);
    setCursor(point);
    const current = gesture.current;
    if (current) {
      const delta = { x: point.x - current.start.x, y: point.y - current.start.y };
      if (current.element && current.baseDelta) {
        const total = { x: current.baseDelta.x + delta.x, y: current.baseDelta.y + delta.y };
        moves.current.move(current.element, total);
        setDraft({ ...current.annotation, bounds: elementBounds(current.element), delta: total });
      } else if (current.original) {
        setDraft(
          current.resize
            ? resizeBox(current.original, current.resize, delta)
            : translateAnnotation(current.original, delta),
        );
      } else if (current.annotation.tool === 'box') {
        setDraft({
          ...current.annotation,
          points: [current.start, point],
          bounds: boundsOf([current.start, point]),
        });
      } else {
        const previous = draftRef.current ?? current.annotation;
        if (distance(previous.points[previous.points.length - 1]!, point) >= 1) {
          const points = [...previous.points, point];
          setDraft({ ...previous, points, bounds: boundsOf(points, previous.size / 2) });
        }
      }
      return;
    }
    if (tool === 'select') {
      const hit =
        selected && resizeHandleAt(selected, point)
          ? selected
          : [...visibleAnnotations].reverse().find((a) => hitTest(a, point));
      setResizeCursor(hit ? resizeHandleAt(hit, point) : null);
    }
    if (tool === 'inspect' || tool === 'move') {
      descendants.current = [];
      updateHovered(elementAt({ x: event.clientX, y: event.clientY }, host));
    }
  };

  const onPointerUp = () => {
    const current = gesture.current;
    const next = draftRef.current;
    if (!current || !next) {
      gesture.current = null;
      return;
    }
    if (next.tool === 'box' && (next.bounds.width < 3 || next.bounds.height < 3)) {
      setDraft(null);
      gesture.current = null;
      return;
    }
    if (
      current.original &&
      Object.keys(next.bounds).every(
        (key) =>
          Math.abs(
            next.bounds[key as keyof typeof next.bounds] -
              current.original!.bounds[key as keyof typeof next.bounds],
          ) < 1,
      )
    ) {
      setDraft(null);
      gesture.current = null;
      return;
    }
    if (
      next.tool === 'move' &&
      next.delta &&
      distance(next.delta, current.baseDelta ?? { x: 0, y: 0 }) < 1
    ) {
      if (current.element) moves.current.move(current.element, current.baseDelta ?? { x: 0, y: 0 });
      setDraft(null);
      gesture.current = null;
      return;
    }
    if (next.tool === 'pencil' || next.tool === 'brush')
      next.bounds = boundsOf(next.points, next.size / 2);
    commit(next);
  };

  function cancel() {
    if (gesture.current?.element) {
      const current = gesture.current;
      moves.current.move(current.element!, current.baseDelta ?? { x: 0, y: 0 });
    }
    setDraft(null);
    gesture.current = null;
  }

  const onExport = async (action: 'image' | 'notes' | 'save', scope: ExportScope) => {
    if (exporting) return;
    setMenu(null);
    setNotice('');
    setCopied(null);
    setExporting(true);
    try {
      if (action === 'notes') {
        await bridge.copyText(
          buildPrompt(sessionRef.current, scope, location.href, document.title),
        );
        setCopied('notes');
      } else {
        captureLock.current = true;
        uiRoot.current?.style.setProperty('display', 'none');
        const capture = await capturePage(bridge, session.annotations, host);
        uiRoot.current?.style.removeProperty('display');
        captureLock.current = false;
        const image = await composeImage(
          capture.dataUrl,
          capture.annotations,
          session.groups,
          capture.viewport,
          scope,
        );
        if (action === 'image') {
          await bridge.copyImage(image);
          setCopied('image');
        } else {
          await bridge.download(image, `qritique-${location.hostname || 'website'}.png`);
          setNotice('Image saved');
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Export failed. Please try again.');
    } finally {
      uiRoot.current?.style.removeProperty('display');
      captureLock.current = false;
      setExporting(false);
    }
  };

  const flipBrushOrientation = () => {
    if (tool === 'brush')
      setOrientation((value) => (value === 'horizontal' ? 'vertical' : 'horizontal'));
  };

  const currentActions = {
    tool,
    menu,
    groupMenu,
    settingsOpen,
    keybindings,
    draft,
    selectedId,
    setTool,
    finishPolygon,
    removeSelected,
    undo,
    cancel,
    onClose,
    clearMarks,
    toggleHidden,
    onExport,
    exportScope,
    flipBrushOrientation,
  };
  const actions = useRef(currentActions);
  actions.current = currentActions;
  useEffect(() => {
    const isEditing = (event: Event) =>
      event
        .composedPath()
        .some(
          (target) =>
            target instanceof HTMLElement &&
            (target.matches('textarea,input') || target.isContentEditable),
        );
    const onKey = (event: KeyboardEvent) => {
      if (captureLock.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const a = actions.current;
      if (a.settingsOpen) return;
      if (isEditing(event)) {
        const shortcut = shortcutFromEvent(event);
        if (shortcut && a.keybindings.close.includes(shortcut)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          a.onClose();
        }
        return;
      }
      const digit =
        /^Digit([1-9])$/.exec(event.code)?.[1] ??
        (!event.shiftKey && /^[1-9]$/.test(event.key) ? event.key : undefined);
      if (digit && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const s = sessionRef.current;
        const kind = event.shiftKey ? 'number' : 'color';
        const groups = s.groups.filter((group) => group.kind === kind);
        const group = groups[Number(digit) - 1];
        if (group) {
          event.preventDefault();
          event.stopImmediatePropagation();
          latestGroupId.current = group.id;
          setNewNumberSelected(
            kind === 'number' &&
              !s.annotations.some((annotation) => annotation.groupId === group.id),
          );
          setNoteGroupId(null);
          update({ ...s, mode: group.kind, activeGroupId: group.id }, false);
        }
        return;
      }
      const shortcut = shortcutFromEvent(event);
      const action = shortcutActions.find(
        (action) => shortcut && a.keybindings[action].includes(shortcut),
      );
      if (!action || (action === 'flipBrush' && a.tool !== 'brush')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (action === 'cancel') {
        if (a.draft || gesture.current) a.cancel();
        else if (a.groupMenu) setGroupMenu(false);
        else if (a.menu) setMenu(null);
        else if (a.selectedId) setSelectedId(null);
      } else if (action === 'close') a.onClose();
      else if (action === 'annotate') {
        const s = sessionRef.current;
        const group =
          s.groups.find((item) => item.id === latestGroupId.current) ??
          s.groups.find((item) => item.id === s.activeGroupId);
        if (group) {
          noteSelection.current =
            s.mode === 'number' && newNumberSelectedRef.current
              ? { noteId: group.id, previousId: s.activeGroupId }
              : null;
          setNewNumberSelected(false);
          update({ ...s, mode: group.kind, activeGroupId: group.id }, false);
          setNoteGroupId(group.id);
          setFocusNote((value) => value + 1);
        }
      } else if (action === 'copyImage' || action === 'copyNotes')
        void a.onExport(action === 'copyImage' ? 'image' : 'notes', a.exportScope);
      else if (action === 'undo' || action === 'redo') a.undo(action === 'redo');
      else if (action === 'delete') a.removeSelected();
      else if (action === 'finish') a.finishPolygon();
      else if (action === 'flipBrush') {
        if (!event.repeat) a.flipBrushOrientation();
      } else if (action === 'hide') a.toggleHidden();
      else if (action === 'clear') a.clearMarks();
      else if (action === 'keybindings') {
        a.cancel();
        setSettingsOpen(true);
      } else if (action === 'parent' || action === 'child') {
        const element = hoveredRef.current;
        if (!element || (a.tool !== 'inspect' && a.tool !== 'move')) return;
        if (
          action === 'parent' &&
          element.parentElement &&
          element.parentElement !== document.body
        ) {
          descendants.current.push(element);
          updateHovered(element.parentElement);
        } else if (action === 'child')
          updateHovered(
            descendants.current.pop() ?? (element.firstElementChild as HTMLElement) ?? element,
          );
      } else if (action === 'smaller' || action === 'larger')
        setSize((n) => clamp(n + (action === 'larger' ? 2 : -2), 2, 140));
      else if (action === 'numbers') {
        const s = sessionRef.current;
        const mode = s.mode === 'number' ? 'color' : 'number';
        const group = s.groups.find(
          (g) =>
            g.kind === mode && (mode === 'color' || !s.annotations.some((a) => a.groupId === g.id)),
        );
        if (group) {
          setNewNumberSelected(mode === 'number');
          latestGroupId.current = group.id;
          setNoteGroupId(null);
          update({ ...s, mode, activeGroupId: group.id }, false);
        }
      } else a.setTool(action);
    };
    const onWheel = (event: WheelEvent) => {
      if (captureLock.current) {
        event.preventDefault();
        return;
      }
      const a = actions.current;
      if (a.settingsOpen) {
        const insideSettings = event
          .composedPath()
          .some((target) => target instanceof HTMLElement && target.matches('.settings-content'));
        if (!insideSettings) event.preventDefault();
        return;
      }
      if (event.ctrlKey && (a.tool === 'pencil' || a.tool === 'brush') && !isEditing(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setSize((n) => clamp(n + (event.deltaY < 0 ? 2 : -2), 2, 140));
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('wheel', onWheel, true);
    };
  }, [update, updateHovered]);

  const hoverBounds = hovered?.isConnected ? elementBounds(hovered) : null;
  return (
    <div
      className="qritique-root"
      data-theme={theme === 'system' ? (systemDark ? 'dark' : 'light') : theme}
      ref={uiRoot}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: This drawing surface supports pointer gestures and global keyboard tools. */}
      <div
        ref={layer}
        className="drawing-surface"
        data-tool={tool}
        style={{ cursor: tool === 'select' && resizeCursor ? `${resizeCursor}-resize` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancel}
        onPointerLeave={() => {
          if (!gesture.current) {
            setCursor(null);
            updateHovered(null);
          }
        }}
        onDoubleClick={() => {
          if (tool === 'polygon') finishPolygon();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (draft) cancel();
          else if (!exporting) flipBrushOrientation();
        }}
      >
        <svg
          className="annotation-canvas"
          width={viewport.width}
          height={viewport.height}
          aria-label="Highlighted areas"
        >
          <defs>
            {session.groups.map((g) => (
              <marker
                key={g.id}
                id={`arrow-${g.id}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke={g.color} strokeWidth="1.3" />
              </marker>
            ))}
          </defs>
          <g transform={`translate(${-viewport.x},${-viewport.y})`}>
            {visibleAnnotations
              .filter((a) => a.id !== draft?.id)
              .map((a) => {
                const group = session.groups.find((g) => g.id === a.groupId);
                return group ? (
                  <Mark
                    key={a.id}
                    annotation={a}
                    group={group}
                    selected={tool === 'select' && selectedId === a.id}
                    dimmed={group.id !== activeGroup.id}
                  />
                ) : null;
              })}
            {draft && (
              <Mark
                annotation={draft}
                selected={tool === 'select'}
                group={session.groups.find((g) => g.id === draft.groupId) ?? activeGroup}
                dimmed={draft.groupId !== activeGroup.id}
              />
            )}
            {draft?.tool === 'polygon' && (
              <>
                {cursor && (
                  <path
                    d={pathOf([draft.points[draft.points.length - 1]!, cursor, draft.points[0]!])}
                    fill="none"
                    stroke={activeGroup.color}
                    strokeWidth="1"
                    strokeDasharray="4 3"
                  />
                )}
                {draft.points.map((p, i) => (
                  <circle
                    key={`${p.x}-${p.y}`}
                    cx={p.x}
                    cy={p.y}
                    r={i === 0 ? 4 : 2.5}
                    fill={activeGroup.color}
                    stroke="var(--color-ui-white)"
                    strokeWidth="1"
                  />
                ))}
              </>
            )}
            {hoverBounds && !gesture.current && (
              <rect
                x={hoverBounds.x}
                y={hoverBounds.y}
                width={hoverBounds.width}
                height={hoverBounds.height}
                fill={activeGroup.color}
                fillOpacity="0.1"
                stroke={activeGroup.color}
                strokeWidth="1"
                strokeDasharray={tool === 'move' ? '5 3' : undefined}
              />
            )}
            {cursor &&
              (tool === 'pencil' || tool === 'brush') &&
              (tool === 'pencil' ? (
                <circle
                  cx={cursor.x}
                  cy={cursor.y}
                  r={size / 2}
                  fill="none"
                  stroke="var(--color-ui-white)"
                  strokeWidth="1"
                />
              ) : (
                <rect
                  x={cursor.x - (orientation === 'horizontal' ? size / 2 : 1)}
                  y={cursor.y - (orientation === 'vertical' ? size / 2 : 1)}
                  width={orientation === 'horizontal' ? size : 2}
                  height={orientation === 'vertical' ? size : 2}
                  fill="none"
                  stroke="var(--color-ui-white)"
                  strokeWidth="1"
                />
              ))}
          </g>
        </svg>
        {hovered && hoverBounds && !gesture.current && (
          <div
            className="element-label"
            style={{
              left: clamp(hoverBounds.x - viewport.x, 8, viewport.width - 240),
              top: Math.max(8, hoverBounds.y - viewport.y - 28),
            }}
          >
            <span>
              {hovered.tagName.toLowerCase()}
              {hovered.id ? `#${hovered.id}` : ''}
            </span>
            <span>
              {Math.round(hoverBounds.width)} × {Math.round(hoverBounds.height)}
            </span>
          </div>
        )}
      </div>
      {selected && tool === 'select' && (
        <div
          className="selection-actions panel"
          data-qritique-ui=""
          style={{
            left: clamp(
              selected.bounds.x + selected.bounds.width - viewport.x - 82,
              8,
              viewport.width - 94,
            ),
            top: clamp(selected.bounds.y - viewport.y - 42, 8, viewport.height - 46),
          }}
        >
          <button
            type="button"
            className="selection-group"
            title="Change selected area group"
            aria-label="Change selected area group"
            aria-expanded={groupMenu}
            onClick={() => setGroupMenu(!groupMenu)}
          >
            <span
              className={selectedGroup?.kind === 'number' ? 'selection-number' : undefined}
              style={
                selectedGroup?.kind === 'color' ? { background: selectedGroup.color } : undefined
              }
            >
              {selectedGroup?.kind === 'number' ? selectedGroup.label : null}
            </span>
            <ChevronDown size={12} />
          </button>
          <span className="divider" />
          <button
            type="button"
            className="delete-mark"
            title="Delete selected area"
            aria-label="Delete selected area"
            onClick={removeSelected}
          >
            <Trash2 size={15} />
          </button>
          {groupMenu && (
            <div
              className="selection-group-menu panel"
              style={
                selected.bounds.y - viewport.y < 270
                  ? { top: 'calc(100% + 6px)', bottom: 'auto' }
                  : undefined
              }
              role="menu"
              aria-label="Selected area group"
            >
              <fieldset className="selection-group-options" aria-label="Colors">
                {session.groups
                  .filter((g) => g.kind === 'color')
                  .map((group) => (
                    <button
                      type="button"
                      role="menuitemradio"
                      key={group.id}
                      aria-label={`Use color ${group.color}`}
                      aria-checked={selected.groupId === group.id}
                      onClick={() => assignGroup(group)}
                    >
                      <span style={{ background: group.color }} />
                    </button>
                  ))}
              </fieldset>
              <fieldset className="selection-group-options" aria-label="Numbered groups">
                {visibleGroups
                  .filter((g) => g.kind === 'number')
                  .map((group) => (
                    <button
                      type="button"
                      role="menuitemradio"
                      key={group.id}
                      aria-label={`Use numbered group ${group.label}`}
                      aria-checked={selected.groupId === group.id}
                      onClick={() => assignGroup(group)}
                    >
                      <span className="selection-number">{group.label}</span>
                    </button>
                  ))}
                <button
                  type="button"
                  role="menuitem"
                  aria-label="Add numbered group"
                  title="Add numbered group"
                  onClick={() => addNumber(selected.id)}
                >
                  <Plus size={16} />
                </button>
              </fieldset>
            </div>
          )}
        </div>
      )}
      <SessionMenu
        canUndo={history.current.past.length > 0}
        canRedo={history.current.future.length > 0}
        hasMarks={session.annotations.length > 0}
        hidden={hiddenIds.size > 0}
        disabled={exporting}
        onClose={onClose}
        onClear={clearMarks}
        onUndo={() => undo()}
        onRedo={() => undo(true)}
        onHide={toggleHidden}
        onSettings={() => {
          cancel();
          setSettingsOpen(true);
        }}
      />
      {notice && (
        <div className="notice panel" role="status" data-qritique-ui="">
          {notice}
        </div>
      )}
      <Toolbar
        tool={tool}
        keybindings={keybindings}
        setTool={setTool}
        groups={visibleGroups}
        exportGroups={session.groups.filter(
          (group) => group.note.trim() || session.annotations.some((a) => a.groupId === group.id),
        )}
        activeGroupId={session.activeGroupId}
        newNumberSelected={newNumberSelected && !draft}
        mode={session.mode}
        selectGroup={selectGroup}
        setMode={(mode) => {
          if (mode === 'number') addNumber();
          else {
            const group = session.groups.find((g) => g.kind === mode);
            if (group) selectGroup(group);
          }
        }}
        addColor={(color) => {
          const existing = session.groups.find(
            (g) => g.kind === 'color' && g.color.toLowerCase() === color.toLowerCase(),
          );
          if (existing) {
            selectGroup(existing);
            return;
          }
          if (session.groups.filter((g) => g.kind === 'color').length >= 5) return;
          const group: Group = {
            id: crypto.randomUUID(),
            kind: 'color',
            label: color.toUpperCase(),
            color,
            note: '',
          };
          latestGroupId.current = group.id;
          setNoteGroupId(null);
          update((s) => ({
            ...s,
            groups: [...s.groups, group],
            activeGroupId: group.id,
            mode: 'color',
          }));
        }}
        addNumber={() => addNumber()}
        removeColor={removeColor}
        note={activeGroup.note}
        showNote={
          activeGroup.kind === 'color' ||
          markedGroupIds.has(activeGroup.id) ||
          noteGroupId === activeGroup.id
        }
        focusNote={focusNote}
        onNoteBlur={() => {
          const selection = noteSelection.current;
          noteSelection.current = null;
          const s = sessionRef.current;
          if (selection && s.activeGroupId === selection.noteId) {
            setNoteGroupId(null);
            setNewNumberSelected(true);
            update({ ...s, activeGroupId: selection.previousId }, false);
          }
        }}
        setNote={(note) =>
          update(
            (s) => ({
              ...s,
              groups: s.groups.map((g) => (g.id === s.activeGroupId ? { ...g, note } : g)),
            }),
            false,
          )
        }
        menu={menu}
        setMenu={setMenu}
        size={size}
        setSize={setSize}
        orientation={orientation}
        setOrientation={setOrientation}
        exporting={exporting}
        copied={copied}
        scope={exportScope}
        setScope={setExportScope}
        onExport={onExport}
      />
      {settingsOpen && (
        <SettingsDialog
          theme={theme}
          onThemeChange={changeTheme}
          palette={palette}
          onPaletteChange={changePalette}
          bindings={keybindings}
          onChange={changeKeybindings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
