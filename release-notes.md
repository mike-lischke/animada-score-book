# Animada Score Book Release Notes

Version history, newest first. The current release is **1.3.0**.

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
