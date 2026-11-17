import {
  ArrowDownToLine,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Image,
  List,
  MousePointer2,
  Move,
  PaintbrushVertical,
  Pencil,
  Pentagon,
  Plus,
  Square,
  SquareMousePointer,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Bridge } from '../lib/bridge';
import { cn } from '../lib/cn';
import { type Keybindings, type ShortcutAction, shortcutLabel } from '../lib/keybindings';
import type { NoteEvent } from '../lib/note-editor';
import type { ExportScope, Group, Mode, Tool } from '../lib/types';
import { Button } from './Button';
import { NoteEditor } from './NoteEditor';

export type Menu = 'shape' | 'draw' | 'export' | null;
interface Props {
  tool: Tool;
  keybindings: Keybindings;
  setTool(tool: Tool): void;
  groups: Group[];
  exportGroups: Group[];
  activeGroupId: string;
  newNumberSelected: boolean;
  selectGroup(group: Group): void;
  mode: Mode;
  setMode(mode: Mode): void;
  addColor(color: string): void;
  addNumber(): void;
  removeColor(id: string): void;
  note: string;
  showNote: boolean;
  focusNote: number;
  noteEditor: Bridge['noteEditor'];
  theme: 'light' | 'dark';
  onNoteEvent(event: NoteEvent): void;
  menu: Menu;
  setMenu(menu: Menu): void;
  size: number;
  setSize(size: number): void;
  orientation: 'horizontal' | 'vertical';
  setOrientation(orientation: 'horizontal' | 'vertical'): void;
  exporting: boolean;
  copied: 'image' | 'notes' | null;
  scope: ExportScope;
  setScope(scope: ExportScope): void;
  onExport(action: 'image' | 'notes' | 'save', scope: ExportScope): void;
}

export function Toolbar(props: Props) {
  const { tool, setTool, groups, activeGroupId, selectGroup, mode, setMode, menu, setMenu } = props;
  const [shape, setShape] = useState<'box' | 'polygon'>('box');
  const [draw, setDraw] = useState<'pencil' | 'brush'>('pencil');
  const [filterMenu, setFilterMenu] = useState<'color' | 'number' | null>(null);
  const { scope, setScope } = props;
  const colorInput = useRef<HTMLInputElement>(null);
  const notePanel = useRef<HTMLDivElement>(null);
  const previousGroupId = useRef(activeGroupId);
  const addColor = useRef(props.addColor);
  addColor.current = props.addColor;
  const shortcut = (action: ShortcutAction) =>
    props.keybindings[action].map(shortcutLabel).join(' / ');
  const toolTitle = (label: string, action: ShortcutAction) =>
    `${label}${shortcut(action) ? ` (${shortcut(action)})` : ''}`;
  const colors = groups.filter((g) => g.kind === 'color');
  const numbers = groups.filter((g) => g.kind === 'number');
  const shapeActive = tool === 'box' || tool === 'polygon';
  const drawActive = tool === 'pencil' || tool === 'brush';
  const ShapeIcon = shape === 'box' ? Square : Pentagon;
  const DrawIcon = draw === 'pencil' ? Pencil : PaintbrushVertical;
  useEffect(() => {
    const input = colorInput.current;
    if (!input) return;
    const onChange = () => addColor.current(input.value);
    input.addEventListener('change', onChange);
    return () => input.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    if (tool === 'box' || tool === 'polygon') setShape(tool);
    if (tool === 'pencil' || tool === 'brush') setDraw(tool);
  }, [tool]);
  useEffect(() => {
    const changed = previousGroupId.current !== activeGroupId;
    previousGroupId.current = activeGroupId;
    if (
      !changed ||
      !props.showNote ||
      !notePanel.current ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const animation = notePanel.current.animate(
      [
        { transform: 'translateY(0)' },
        { transform: 'translateY(2px)', offset: 0.4 },
        { transform: 'translateY(0)' },
      ],
      { duration: 140, easing: 'ease-out' },
    );
    return () => animation.cancel();
  }, [activeGroupId, props.showNote]);
  useEffect(() => {
    if (scope === 'all') return;
    const remaining = scope.filter((id) => props.exportGroups.some((group) => group.id === id));
    if (remaining.length !== scope.length) setScope(remaining.length ? remaining : 'all');
  }, [props.exportGroups, scope, setScope]);
  useEffect(() => {
    if (menu !== 'export') setFilterMenu(null);
  }, [menu]);
  const toggleFilter = (id: string) => {
    const selected = scope === 'all' ? [] : scope;
    const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
    setScope(next.length ? next : 'all');
  };
  const toggleMenu = (next: Menu) => setMenu(menu === next ? null : next);
  const choose = (next: Tool) => {
    setTool(next);
    setMenu(null);
  };
  return (
    <div className="dock" data-qritique-ui="" onPointerDown={(event) => event.stopPropagation()}>
      {props.showNote && (
        <div ref={notePanel} className="note-panel panel">
          <NoteEditor
            editor={props.noteEditor}
            state={{
              groupId: activeGroupId,
              note: props.note,
              focus: props.focusNote,
              theme: props.theme,
              closeShortcuts: props.keybindings.close,
            }}
            receive={props.onNoteEvent}
          />
        </div>
      )}
      {mode === 'number' && (
        <fieldset className="number-panel panel" aria-label="Numbered notes">
          {numbers.map((group) => (
            <button
              type="button"
              key={group.id}
              className={cn(
                'number-button',
                activeGroupId === group.id && !props.newNumberSelected && 'selected',
              )}
              aria-label={`Note ${group.label}`}
              aria-pressed={activeGroupId === group.id && !props.newNumberSelected}
              onClick={() => selectGroup(group)}
            >
              {group.label}
            </button>
          ))}
          <button
            type="button"
            className={cn('add-number', props.newNumberSelected && 'selected')}
            aria-label="Add numbered note"
            aria-pressed={props.newNumberSelected}
            onClick={props.addNumber}
          >
            <Plus size={14} />
          </button>
        </fieldset>
      )}
      <div className="toolbar panel" role="toolbar" aria-label="Annotation tools">
        <Button
          active={tool === 'select'}
          title={toolTitle('Selector', 'select')}
          aria-label="Selector"
          aria-pressed={tool === 'select'}
          onClick={() => choose('select')}
        >
          <MousePointer2 size={21} />
        </Button>
        <div className="tool-menu-anchor">
          <div className={cn('split-button', shapeActive && 'is-active')}>
            <Button
              active={shapeActive}
              title={toolTitle(shape === 'box' ? 'Box' : 'Polygon', shape)}
              aria-label={shape === 'box' ? 'Box' : 'Polygon'}
              onClick={() => choose(shape)}
            >
              <ShapeIcon size={22} />
            </Button>
            <button
              type="button"
              className="chevron"
              aria-label="Shape tools"
              aria-expanded={menu === 'shape'}
              onClick={() => toggleMenu('shape')}
            >
              <ChevronDown size={13} className={cn(menu === 'shape' && 'rotated')} />
            </button>
          </div>
          {menu === 'shape' && (
            <div className="menu panel shape-menu" role="menu" aria-label="Shape tools">
              <Button
                size="menu"
                active={shape === 'polygon'}
                role="menuitem"
                onClick={() => {
                  setShape('polygon');
                  choose('polygon');
                }}
              >
                <Pentagon size={18} />
                Polygon
              </Button>
              <Button
                size="menu"
                active={shape === 'box'}
                role="menuitem"
                onClick={() => {
                  setShape('box');
                  choose('box');
                }}
              >
                <Square size={18} />
                Box
              </Button>
            </div>
          )}
        </div>
        <div className="tool-menu-anchor draw-menu-anchor">
          <div className={cn('split-button', drawActive && 'is-active')}>
            <Button
              active={drawActive}
              title={`${toolTitle(draw === 'pencil' ? 'Pencil' : 'Brush', draw)} · Ctrl + scroll to resize`}
              aria-label={draw === 'pencil' ? 'Pencil' : 'Brush'}
              onClick={() => choose(draw)}
            >
              <DrawIcon size={24} />
            </Button>
            <button
              type="button"
              className="chevron"
              aria-label="Drawing tools"
              aria-expanded={menu === 'draw'}
              onClick={() => toggleMenu('draw')}
            >
              <ChevronDown size={13} className={cn(menu === 'draw' && 'rotated')} />
            </button>
          </div>
          {menu === 'draw' && (
            <div className="menu panel draw-menu">
              <div className="draw-tools" role="menu" aria-label="Drawing tools">
                {(['brush', 'pencil'] as const).map((drawingTool) => {
                  const Icon = drawingTool === 'brush' ? PaintbrushVertical : Pencil;
                  const selected = draw === drawingTool;
                  return (
                    <Button
                      key={drawingTool}
                      size="menu"
                      active={selected}
                      role="menuitemradio"
                      aria-checked={selected}
                      aria-controls="drawing-settings"
                      onClick={() => {
                        setDraw(drawingTool);
                        setTool(drawingTool);
                      }}
                    >
                      <Icon size={19} />
                      {drawingTool === 'brush' ? 'Brush' : 'Pencil'}
                      {selected && <ChevronRight size={12} className="draw-settings-indicator" />}
                    </Button>
                  );
                })}
              </div>
              <section
                id="drawing-settings"
                className="draw-settings"
                aria-label={`${draw === 'brush' ? 'Brush' : 'Pencil'} settings`}
              >
                <div className="size-control">
                  <label className="draw-setting-label" htmlFor="stroke-size">
                    Size
                    <span className="stroke-size-value">
                      {props.size}
                      <span>px</span>
                    </span>
                  </label>
                  <input
                    id="stroke-size"
                    type="range"
                    min="2"
                    max="140"
                    value={props.size}
                    style={
                      {
                        '--size-progress': `${((props.size - 2) / 138) * 100}%`,
                      } as React.CSSProperties
                    }
                    aria-label="Stroke size"
                    aria-valuetext={`${props.size} pixels`}
                    onChange={(event) => props.setSize(Number(event.target.value))}
                  />
                </div>
                {draw === 'brush' && (
                  <fieldset className="orientation-control" aria-label="Brush orientation">
                    <span
                      className="draw-setting-label"
                      title={`${toolTitle('Flip brush direction', 'flipBrush')} · Right-click when not drawing`}
                    >
                      Direction
                    </span>
                    <div className="orientation-options">
                      {(['horizontal', 'vertical'] as const).map((orientation) => (
                        <Button
                          key={orientation}
                          active={props.orientation === orientation}
                          title={`${orientation === 'horizontal' ? 'Horizontal' : 'Vertical'} brush`}
                          aria-label={`${orientation === 'horizontal' ? 'Horizontal' : 'Vertical'} brush`}
                          aria-pressed={props.orientation === orientation}
                          onClick={() => props.setOrientation(orientation)}
                        >
                          <span aria-hidden="true" className={`orientation-mark ${orientation}`} />
                        </Button>
                      ))}
                    </div>
                  </fieldset>
                )}
              </section>
            </div>
          )}
        </div>
        <Button
          active={tool === 'inspect'}
          title={toolTitle('Inspect element', 'inspect')}
          aria-label="Inspect element"
          aria-pressed={tool === 'inspect'}
          onClick={() => choose('inspect')}
        >
          <SquareMousePointer size={24} />
        </Button>
        <Button
          active={tool === 'move'}
          title={toolTitle('Move element', 'move')}
          aria-label="Move element"
          aria-pressed={tool === 'move'}
          onClick={() => choose('move')}
        >
          <span className="move-icon">
            <Move size={22} />
            <MousePointer2 size={12} />
          </span>
        </Button>
        <span className="divider" />
        <fieldset className="palette" aria-label="Annotation colors">
          {colors.map((group) => (
            <div className="color-swatch" key={group.id}>
              <button
                type="button"
                className={cn(
                  'color-button',
                  mode === 'color' && activeGroupId === group.id && 'selected',
                )}
                style={{ '--swatch': group.color } as React.CSSProperties}
                aria-label={group.label}
                title={group.label}
                aria-pressed={mode === 'color' && activeGroupId === group.id}
                onClick={() => selectGroup(group)}
              />
              {mode === 'color' && activeGroupId === group.id && (
                <button
                  type="button"
                  className="delete-color"
                  aria-label={`Delete color ${group.color}`}
                  title="Delete color and its markings"
                  onClick={() => props.removeColor(group.id)}
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
          {colors.length < 5 && (
            <button
              type="button"
              className="add-color"
              title="Add color"
              aria-label="Add color"
              onClick={() => colorInput.current?.click()}
            >
              <Plus size={12} />
            </button>
          )}
        </fieldset>
        <input
          className="hidden-color"
          ref={colorInput}
          type="color"
          aria-label="Custom color"
          defaultValue="#b14dff"
        />
        <button
          type="button"
          className={cn('number-mode', mode === 'number' && 'selected')}
          title={toolTitle('Numbered notes', 'numbers')}
          aria-label="Numbered notes"
          aria-pressed={mode === 'number'}
          onClick={() => setMode(mode === 'number' ? 'color' : 'number')}
        >
          1
        </button>
        <span className="divider" />
        <div className="tool-menu-anchor export-anchor">
          <Button
            title="Export"
            aria-label="Export"
            aria-expanded={menu === 'export'}
            active={menu === 'export'}
            disabled={props.exporting}
            onClick={() => toggleMenu('export')}
          >
            {props.copied ? (
              <ClipboardCheck size={25} className="copy-success" />
            ) : (
              <ArrowDownToLine size={25} />
            )}
          </Button>
          {menu === 'export' && (
            <div className="menu panel export-menu" role="menu" aria-label="Export annotations">
              <fieldset className="export-filters" aria-label="Export filter">
                <button
                  type="button"
                  className={cn('filter-all', scope === 'all' && 'selected')}
                  aria-pressed={scope === 'all'}
                  onClick={() => {
                    setScope('all');
                    setFilterMenu(null);
                  }}
                >
                  All
                </button>
                {(['color', 'number'] as const).map((kind) => {
                  const options = props.exportGroups.filter((group) => group.kind === kind);
                  const selected =
                    scope === 'all' ? [] : options.filter((group) => scope.includes(group.id));
                  return (
                    <div className="filter-anchor" key={kind}>
                      <button
                        type="button"
                        className={cn('filter-trigger', selected.length > 0 && 'selected')}
                        aria-label={kind === 'color' ? 'Filter colors' : 'Filter numbers'}
                        aria-expanded={filterMenu === kind}
                        disabled={!options.length}
                        onClick={() => setFilterMenu(filterMenu === kind ? null : kind)}
                      >
                        {selected.length ? (
                          <span className="filter-selection" aria-hidden="true">
                            {selected.slice(0, 5).map((group, index) => (
                              <span
                                key={group.id}
                                className={cn(
                                  'filter-selection-item',
                                  kind === 'color' && 'filter-selection-color',
                                )}
                                style={
                                  kind === 'color'
                                    ? ({ '--swatch': group.color } as React.CSSProperties)
                                    : undefined
                                }
                              >
                                {kind === 'number' &&
                                  (index === 4 && selected.length > 5 ? '+' : group.label)}
                              </span>
                            ))}
                          </span>
                        ) : kind === 'color' ? (
                          'Color'
                        ) : (
                          'Nums'
                        )}
                        <ChevronDown size={12} />
                      </button>
                      {filterMenu === kind && options.length > 0 && (
                        <fieldset
                          className="filter-options panel"
                          aria-label={kind === 'color' ? 'Colors' : 'Numbers'}
                        >
                          {options.map((group) => (
                            <button
                              type="button"
                              key={group.id}
                              className={cn(
                                'filter-option',
                                kind === 'color' && 'filter-color-option',
                              )}
                              aria-label={kind === 'color' ? group.label : `#${group.label}`}
                              aria-pressed={scope !== 'all' && scope.includes(group.id)}
                              onClick={() => toggleFilter(group.id)}
                            >
                              {kind === 'color' && (
                                <span
                                  className="filter-swatch"
                                  style={{ '--swatch': group.color } as React.CSSProperties}
                                />
                              )}
                              {kind === 'number' && group.label}
                            </button>
                          ))}
                        </fieldset>
                      )}
                    </div>
                  );
                })}
              </fieldset>
              <Button
                role="menuitem"
                size="menu"
                title={`${toolTitle('Copy image', 'copyImage')} · Shift-click to save PNG`}
                onClick={(event) => {
                  if (event.isTrusted) props.onExport(event.shiftKey ? 'save' : 'image', scope);
                }}
              >
                <Image size={15} />
                Copy image
              </Button>
              <Button
                role="menuitem"
                size="menu"
                title={toolTitle('Copy notes', 'copyNotes')}
                onClick={(event) => {
                  if (event.isTrusted) props.onExport('notes', scope);
                }}
              >
                <List size={15} />
                Copy notes
              </Button>
            </div>
          )}
        </div>
      </div>
      {props.copied && (
        <span className="export-feedback panel" role="status">
          Copied {props.copied}
        </span>
      )}
    </div>
  );
}
