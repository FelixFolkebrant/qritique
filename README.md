# Qritique

A Chrome and Firefox extension for visual website feedback. Mark regions, write a note for each color or number, and copy the annotated page alongside a prompt for your next design iteration.

The interface follows the supplied references: a compact floating dark toolbar, blue active tools, blue/red/green swatches, a note field above the dock, and small upward-opening menus. UI styles live inside a shadow root so website styles do not change the controls.

## Run

Requires Node 22.12+ and pnpm. Dependencies are locked in `pnpm-lock.yaml`.

```sh
pnpm install
pnpm dev             # Chrome extension with live reload
pnpm dev:firefox     # Firefox extension with live reload
pnpm dev:preview     # Standalone playground at http://localhost:5173
```

The playground uses the same annotation UI and supports drawing, inspection, moving, saved notes, and copying prompts. Real website screenshot capture requires the installed extension.

## Load the extension

```sh
pnpm build:all
```

- **Chrome:** open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `.output/chrome-mv3`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `.output/firefox-mv3/manifest.json`.

Click the extension icon, or press **Alt+Shift+Q**, to start or stop annotating the current website. Firefox 128+ and Chrome 116+ are the minimum targets. For distributable ZIPs, run `pnpm zip`. Firefox installation outside temporary development requires Mozilla signing.

## Use

Select a tool and a color, mark an area, and type its note. The note field is always available for the selected color, even without markings. For numbered groups, it appears when the selected group has a completed marking or when you press `C` to annotate the current group. Several areas can share one color and its note. The selector switches to the clicked area's group. In selection mode, drag a box's corners or borders to resize it, or drag inside it to move it. The group dropdown beside trash shows color swatches and numbered groups. Choose one to move the selected marking into its shared note group, or use `+` to assign the next unused numbered group in one undoable step. The `#` button switches to numbered groups with white numbered marks; its row starts with `1` and `+`, with `+` selected to create a new number. Each new numbered marking selects the next number automatically; select an earlier number to add more markings or edit its note. The next number is prepared automatically but only appears when you start drawing; canceling the drawing hides it again. The initial `1` stays visible, and `+` selects the next unused group. Empty numbered categories are removed and later numbers shift down, keeping their markings and notes together. The `+` next to the colors opens a native custom color picker; up to five colors can be added. Hover the selected color to reveal its small delete button. Deleting a color removes its markings and note in one undoable step.

| Action                     | Shortcut / gesture                                                            |
| -------------------------- | ----------------------------------------------------------------------------- |
| Selector                   | `V`                                                                           |
| Box                        | `R`, then drag                                                                |
| Polygon                    | `L`, click vertices, then `Enter`, double click, or click the first vertex    |
| Pencil                     | `P`, then draw                                                                |
| Flat brush                 | `B`, then draw; choose horizontal/vertical in the drawing menu                |
| Flip brush direction       | `F` or right-click while Brush is selected and no stroke is in progress       |
| Resize pencil / brush      | `Ctrl` + wheel, `[` / `]`, or the menu slider                                 |
| Inspect element            | `I`, hover, then click                                                        |
| Move element               | `M`, hover, then drag                                                         |
| Inspect parent / child     | `↑` / `↓` while hovering with inspect or move                                 |
| Delete selected mark       | `Delete` / `Backspace`, or its trash button                                   |
| Hide / show existing marks | `H` or the corner menu; new markings stay visible                             |
| Open settings              | `?` or the corner menu                                                        |
| Undo / redo                | `Ctrl` / `Cmd` + `Z`; add `Shift` to redo                                     |
| Select color               | `1`–`5`                                                                       |
| Numbered notes             | `N`; select an existing number with `Shift` + `1`–`9`                         |
| Annotate current group     | `C`                                                                           |
| Copy image / notes         | `Ctrl` / `Cmd` + `C`; add `Shift` for notes (uses the selected export filter) |
| Cancel                     | `Escape` cancels a draft or dismisses menus or selection                      |
| Close                      | `Ctrl` / `Cmd` + `Escape`                                                     |

Hover the small menu tab in the very top-right corner to smoothly expand the controls. From left to right: **Hide / Show**, **Settings**, **Undo**, **Redo**, **Clear**, and **Close**. Moving away collapses the bar back into its corner tab. Clear removes all markings in one undoable step. Hide temporarily conceals existing highlights and arrows while letting you create new visible markings; show restores them. Hidden markings are still saved and included in exports. Settings lets you choose 0–5 default palette colors for new page sessions. Keybinds are grouped by category and can be reassigned, unassigned, or reset to defaults, and are saved across websites in the extension. Press `Esc` to stop picking a shortcut; cancel always uses `Esc` and cannot be reassigned. Modified Escape combinations can still be assigned. The browser activation shortcut (`Alt+Shift+Q`) is managed in browser extension settings.

While a note is focused, Ctrl/Cmd+Z and redo use native text editing. Outside the note, they undo or redo marking creation, movement, resizing, color changes, deletion, and clearing without undoing note text.

Moves use CSS transforms to keep surrounding layout intact. Undoing or deleting a move restores the element. Closing the extension restores all moved elements; reopening reapplies saved moves.

The export menu lets you choose **All** or select any combination of colors and numbered notes that contain feedback:

- **Copy image** captures and stitches the full page, then renders the matching highlights and movement arrows. The toolbar, cursor, and selection controls are excluded. Fixed/sticky elements are included once. Your original scroll position is restored afterwards.
- **Shift-click Copy image** downloads the PNG instead.
- **Copy notes** creates a prompt mapping colors/numbers to notes, including inspected element selectors and movement distances.

## Freezing and storage

Annotation mode blocks page clicks, pauses CSS/Web Animations and media, and keeps native page scrolling available. It keeps the live DOM for accurate inspection. Website JavaScript, network updates, canvas animation, and content inside frames or closed shadow roots are not suspended. Inspect can target a frame or shadow host; it cannot inspect their private contents. Full-page export captures the document, including the current state of embedded scroll panels. Infinite-scroll pages and pages whose layout changes while capturing can require another attempt. Very large exports are scaled to canvas limits; pages requiring more than 80 captures are rejected with a clear message.

Notes and marks are saved locally per page URL (origin, pathname, query; hash excluded). No server, account, analytics, or outbound network calls are used by the extension. It only requests temporary website access when activated (`activeTab`), local storage, scripting, and clipboard writing. On Chrome, clipboard fallback for insecure HTTP pages briefly opens and closes a focused extension tab, then returns to the annotated page. Browser-internal pages and extension-store pages block content-script injection; the icon shows `!` when a page cannot be annotated.

## Validate

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium firefox
pnpm test:e2e
pnpm build:all
```

Unit tests cover geometry and prompt filtering. Browser tests cover drawing, selecting, resizing, recoloring, deleting, text and marking undo/redo, corner-menu actions, hiding, keybind customization and persistence, scrolling, numbered notes, inspection, movement restoration, and prompt copying.

React + TypeScript + WXT; Tailwind CSS, Biome, pnpm, clsx, CVA, tailwind-merge, and lucide-react. The preview-only photos are from Unsplash and are excluded from extension builds.
