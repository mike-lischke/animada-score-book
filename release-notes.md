# Animada Score Book Release Notes

Version history, newest first. The current release is **1.5.0**.

## 1.5.0

- Range dynamics: add crescendo and decrescendo hairpins and forte markings in the staff view, with support for
  editing, playback, clipboard operations, snapshots, undo and redo, and printing.
- Score editing: preserve articulations when pasting and fix selection looping.
- Editor polish: hide controls unavailable in the grid view, separate repeat controls, and improve toolbar spacing
  and the grid-view simile sign.
- Reliability: dispose animation engines cleanly and surface permission errors.

## 1.4.0

- Music font rendering: the score draws its notation symbols from the selected music font, with the percussion clef, time signature, noteheads, rests, flags, dots and technique marks coming from the font's own glyphs and catalogue, and staff lines, stems, beams and barlines derived from its engraving defaults. The bundled fonts are verified at build time, and the music font is picked in the settings with a per-font sample and live preview.
- Repeats: `|:` and `:|` barlines are drawn from the font metrics, stored on the arrangement (undo, clipboard and snapshots included) and played in performed order, as are one-bar repeats (simile) on track pieces. The transport,
  play range, play head and status bar follow the resolved play order.
- Staff view performance: only a window of measures is rendered instead of the whole score (26,663 → 6,331 DOM nodes on a 79-measure score, view switch 206 → 44 ms). Measures carry a data-backed width that is resized by dragging the closing barline, travels through copy/paste, undo and snapshots, and packs the print view's rows.
- Note entry: insert and overwrite modes with a mode button in the toolbar, and the input logic moved into the active measure editor, so the grid and staff views own their cursor, entry values and preview.
- Selection and editing: note groups (tuplets, beams) are derived from the measure composition, so rendering, hit testing and selection share one rule set; a selection rectangle selects the groups it covers; subdivisions are
  atomic blocks; subdivisions can be pasted across tracks and mixed ranges; selection rectangles align with the elements they decorate and note decorations highlight in the selection colour.
- Rests: a measure keeps the rest structure it holds, split rests stay visible and selectable, and a whole-measure rest can be selected and addressed like any other run.
- Snapshot format: the legacy packing readers are gone in favour of a single v5 schema plus BananaDrum share links; measure labels were dropped, and optional data now travels in a versionless extension-chunk container. Schema 6 adds the one-bar repeat mark and upgrades v5 on load.
- Backend: a full database reset (drop → migrations → seed → anonymous user) from the user menu, which also fixes the setup overwrite path; seeding is idempotent and runs only into an empty database, and the migration runner only maintains the schema.
- Fixes and polish: tuplet brackets include rests, stems follow their head's line offset, press roll marks sit on the stem, the staff prefix stays mounted in the windowed view, smoother play-head movement, a split vendor chunk, and the play state and setup mode became enums.

## 1.3.0

- Note editing in the staff view: note entry with note length, note style and articulation toolbars, editing down to
  single notes, keyboard navigation, backspace removal and rest handling.
- Per-view measure editors: the grid view keeps its fixed raster and its virtual sub-note projection, while the staff
  view places notes at free fractions. Making room follows the view — the staff shifts later notes, the grid shortens
  the new one.
- Fraction-based measure model: events tile their bar exactly, and selections, clipboard and edits are addressed by
  model events and fractions instead of DOM position, so a selection survives a reload.
- Extended notation: dotted note lengths, rest lengths that follow the span, thirty-second notes (entered in the staff
  view and drawn in the grid as a subdivision of the step), tuplet editing and subdivision selection.
- Subdivisions can be copied and pasted, and created from the staff view, with the offered split sized by the length
  of the selected notes.
- Selection rework: selections are stored as coordinates and resolved back on load, rendered score elements are
  resolved through a typed DOM registry, measures and events reference their parents, and track ids stay unique across
  restored scores.
- Backend: file-based database migrations with branch-specific databases and startup checksum verification, better
  handling of an unreachable database or a schema mismatch, plus runtime validation and permission cycle detection in
  the auth code.
- UI: the codicon font was replaced with tree-shakeable inline SVG Material Design icons, the note length, note style
  and articulation toolbars got new icons, the collapsible header and the undo/redo selection invalidation were
  reworked, and the app version is shown in the status bar.
- Removed the legacy selection infrastructure, dead UI components and the `ScoreBookUiServices` wrapper.
- The architecture decisions made along the way are recorded as ADRs in `docs/adr/`.

## 1.2.0

- Added an interactive tutorial wizard for first-time onboarding.
- Fixed permission updates of a score library entry.
- Fixed the database reset when no users exist.

## 1.1.0

- The backend was rewritten from PHP to Node.js.
- User and group management with permissions and an audit trail, and backend hardening: CORS configuration, proxy
  trust, brute-force rate limiting, upload validation and `nosniff`.
- Notification center with a VS Code-like API, and a status bar.
- Articulation model with ghost and damped decorations and an accent mark; snapshot format v3.
- Multi-level selection system; the current selection is persisted and restored on app load.
- Scores can be loaded and shared through a direct URL.
- Menu framework components (Menu, MenuBar, MenuItem, TagInput), a collapsible header, and a modal reconnect dialog
  when the backend goes away.
- Database schema versioning, awaitable dialogs and a database reset pipeline; `backend-config.json` became optional.
- Fixes: thirty-second note beams, beat ticks taken from the meter's beat groups, pulse markers in the grid view,
  staff-view 1:2 subdivision rendering, tuplet label alignment, tuplet detection and nested polyrhythm migration.
- Integration tests against a real database, and more stable Playwright runs in CI.

## 1.0.0

- First public release: a browser-based score management and playback platform for Samba groups.
- Score library in a tree view with database-backed storage and fine-grained access control (private, group-shared,
  world-readable), including user and group administration.
- Arrangement playback with the Web Audio API: multiple tracks, per-track mixer, tempo and volume control, loop and
  bar-range playback, metronome with optional count-in.
- Two display modes, switchable on the fly: the grid view for learning and the notation view for seasoned players,
  including a minimap and smooth automatic scrolling.
- Samba-first notation with special note heads and markings for playing techniques, printing of both views, MP3
  export, and customizable themes.
- Import of scores from BananaDrum URLs to bring an existing repertoire on board.
