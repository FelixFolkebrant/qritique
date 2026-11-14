import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpDown,
  Brush,
  ChevronDown,
  Hash,
  Image,
  List,
  MousePointer2,
  Move,
  Pencil,
  Pentagon,
  Plus,
  Square,
  SquareMousePointer,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { type Keybindings, type ShortcutAction, shortcutLabel } from '../lib/keybindings';
import type { ExportScope, Group, Mode, Tool } from '../lib/types';
import { Button } from './Button';

export type Menu = 'shape' | 'draw' | 'export' | null;
interface Props {
  tool: Tool;
  keybindings: Keybindings;
  setTool(tool: Tool): void;
  groups: Group[];
  activeGroupId: string;
  selectGroup(group: Group): void;
  mode: Mode;
  setMode(mode: Mode): void;
  addColor(color: string): void;
  addNumber(): void;
  removeColor(id: string): void;
  note: string;
  showNote: boolean;
  setNote(note: string): void;
  menu: Menu;
  setMenu(menu: Menu): void;
  size: number;
  setSize(size: number): void;
  orientation: 'horizontal' | 'vertical';
  setOrientation(orientation: 'horizontal' | 'vertical'): void;
  exporting: boolean;
  onExport(action: 'image' | 'notes' | 'save', scope: ExportScope): void;
}

export function Toolbar(props: Props) {
  const { tool, setTool, groups, activeGroupId, selectGroup, mode, setMode, menu, setMenu } = props;
  const [shape, setShape] = useState<'box' | 'polygon'>('box');
  const [draw, setDraw] = useState<'pencil' | 'brush'>('pencil');
  const [scope, setScope] = useState<ExportScope>('all');
  const colorInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const shortcut = (action: ShortcutAction) =>
    props.keybindings[action].map(shortcutLabel).join(' / ');
  const toolTitle = (label: string, action: ShortcutAction) =>
    `${label}${shortcut(action) ? ` (${shortcut(action)})` : ''}`;
  const colors = groups.filter((g) => g.kind === 'color');
  const numbers = groups.filter((g) => g.kind === 'number');
  const shapeActive = tool === 'box' || tool === 'polygon';
  const drawActive = tool === 'pencil' || tool === 'brush';
  const ShapeIcon = shape === 'box' ? Square : Pentagon;
  const DrawIcon = draw === 'pencil' ? Pencil : Brush;
  useEffect(() => {
    if (tool === 'box' || tool === 'polygon') setShape(tool);
    if (tool === 'pencil' || tool === 'brush') setDraw(tool);
  }, [tool]);
  useEffect(() => {
    if (!props.showNote || !textarea.current) return;
    textarea.current.style.height = 'auto';
    if (props.note)
      textarea.current.style.height = `${Math.min(160, textarea.current.scrollHeight)}px`;
  }, [props.note, props.showNote]);
  useEffect(() => {
    if (scope !== 'all' && scope !== 'number' && !groups.some((group) => group.id === scope))
      setScope('all');
  }, [groups, scope]);
  const toggleMenu = (next: Menu) => setMenu(menu === next ? null : next);
  const choose = (next: Tool) => {
    setTool(next);
    setMenu(null);
  };
  return (
    <div className="dock" data-qritique-ui="" onPointerDown={(event) => event.stopPropagation()}>
      {props.showNote && (
        <div className="note-panel panel">
          <textarea
            ref={textarea}
            aria-label="Note for selected group"
            placeholder="Add note"
            value={props.note}
            rows={1}
            spellCheck={false}
            onChange={(event) => {
              props.setNote(event.target.value);
              event.target.style.height = 'auto';
              event.target.style.height = `${Math.min(160, event.target.scrollHeight)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                textarea.current?.blur();
              }
            }}
          />
        </div>
      )}
      {mode === 'number' && (
        <fieldset className="number-panel panel" aria-label="Numbered notes">
          {numbers.map((group) => (
            <button
              type="button"
              key={group.id}
              className={cn('number-button', activeGroupId === group.id && 'selected')}
              aria-label={`Note ${group.label}`}
              aria-pressed={activeGroupId === group.id}
              onClick={() => selectGroup(group)}
            >
              {group.label}
            </button>
          ))}
          <button
            type="button"
            className="add-number"
            aria-label="Add numbered note"
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
        <div className="tool-menu-anchor">
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
            <div className="menu panel draw-menu" role="menu" aria-label="Drawing tools">
              <Button
                size="menu"
                active={draw === 'brush'}
                role="menuitem"
                onClick={() => {
                  setDraw('brush');
                  choose('brush');
                }}
              >
                <Brush size={18} />
                Brush
              </Button>
              <Button
                size="menu"
                active={draw === 'pencil'}
                role="menuitem"
                onClick={() => {
                  setDraw('pencil');
                  choose('pencil');
                }}
              >
                <Pencil size={18} />
                Pencil
              </Button>
              <div className="size-control">
                <input
                  type="range"
                  min="2"
                  max="140"
                  value={props.size}
                  aria-label="Stroke size"
                  onChange={(event) => props.setSize(Number(event.target.value))}
                />
                <span>{props.size}</span>
              </div>
              <fieldset className="orientation-control" aria-label="Brush orientation">
                <Button
                  active={props.orientation === 'horizontal'}
                  title="Horizontal brush"
                  aria-label="Horizontal brush"
                  onClick={() => props.setOrientation('horizontal')}
                >
                  <ArrowLeftRight size={17} />
                </Button>
                <Button
                  active={props.orientation === 'vertical'}
                  title="Vertical brush"
                  aria-label="Vertical brush"
                  onClick={() => props.setOrientation('vertical')}
                >
                  <ArrowUpDown size={17} />
                </Button>
              </fieldset>
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
        {colors.length > 0 && (
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
          </fieldset>
        )}
        <button
          type="button"
          className="add-color"
          title="Add color"
          aria-label="Add color"
          onClick={() => colorInput.current?.click()}
        >
          <Plus size={12} />
        </button>
        <input
          className="hidden-color"
          ref={colorInput}
          type="color"
          aria-label="Custom color"
          defaultValue="#b14dff"
          onChange={(event) => props.addColor(event.target.value)}
        />
        <button
          type="button"
          className={cn('number-mode', mode === 'number' && 'selected')}
          title={toolTitle('Numbered notes', 'numbers')}
          aria-label="Numbered notes"
          aria-pressed={mode === 'number'}
          onClick={() => setMode(mode === 'number' ? 'color' : 'number')}
        >
          <Hash size={19} />
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
            <ArrowDownToLine size={25} />
          </Button>
          {menu === 'export' && (
            <div className="menu panel export-menu" role="menu" aria-label="Export annotations">
              <fieldset className="export-filters" aria-label="Export filter">
                <button
                  type="button"
                  className={cn('filter-all', scope === 'all' && 'selected')}
                  aria-pressed={scope === 'all'}
                  onClick={() => setScope('all')}
                >
                  All
                </button>
                {colors.map((group) => (
                  <button
                    type="button"
                    key={group.id}
                    className={cn('filter-color', scope === group.id && 'selected')}
                    style={{ '--swatch': group.color } as React.CSSProperties}
                    aria-label={`Export ${group.label.toLowerCase()}`}
                    aria-pressed={scope === group.id}
                    onClick={() => setScope(group.id)}
                  />
                ))}
                <button
                  type="button"
                  className={cn('filter-number', scope === 'number' && 'selected')}
                  aria-label="Export numbered notes"
                  aria-pressed={scope === 'number'}
                  onClick={() => setScope('number')}
                >
                  <Hash size={12} />
                </button>
              </fieldset>
              <Button
                role="menuitem"
                size="menu"
                title="Copy image · Shift-click to save PNG"
                onClick={(event) => props.onExport(event.shiftKey ? 'save' : 'image', scope)}
              >
                <Image size={15} />
                Copy image
              </Button>
              <Button role="menuitem" size="menu" onClick={() => props.onExport('notes', scope)}>
                <List size={15} />
                Copy notes
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
