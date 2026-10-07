# App Layout and Interaction Contract

- Status: accepted as the working template for issue #52, phase 1; details remain subject to visual refinement
- Scope: structural layout, control availability, and interaction states; visual styling is deferred

## Surface Contract

| Surface | Role | Availability and lifecycle |
|---|---|---|
| Header | Navigation, identity/save, global actions | One row; primary direct, secondary in overflow. |
| Score context | Track/measure selectors and options | Actions stay by their context. |
| Playback toolbar | Transport, position, tempo, volume, toggles | Fixed, always visible; score-independent. |
| Instrument sidebar | Instrument icons; per-track mixer | Icons visible; mixer collapsed by default. |
| Range tools | Hairpin and forte (`f`) | Floating actions start staff placing mode. |
| Selection popover | Note and selection-based structure actions | Temporary; groups follow selection. |
| Status/navigation | Status, section/position, minimap, zoom | Outside score content; coordinated group. |

Persistent toolbars are app-shell surfaces, not score children: score zoom and scrolling must not move or resize them.
Secondary playback controls may collapse, but must remain easy to reach on every platform.
The range-articulation toolbar is a tool selector, not an indicator that drawing mode is already active. The selected
action starts the viewer's pointer-owning placing mode; Escape leaves that mode, while choosing the other action
switches tools. A contextual popover is temporary: outside click, Escape, or loss of its target closes it; focus returns
to its invoking control, and the score remains interactive outside the popover. On narrow screens, an anchored popover
may become edge-attached.

## Selection Action Grouping

Tuplets, simile, and repeat barlines are selection actions: none is note-specific or starts a pointer-owning mode.
Keep them out of permanent toolbars and group them in the selection popover, separate from note-value/style controls.
Offer only the group applicable to the current selection, using the existing eligibility rules:

- Tuplets apply to one note/cell or a compatible note selection.
- Simile applies to selected track-measure pieces.
- Repeat start/end marks apply to selected whole measures.

Each action completes on activation and leaves score input in its normal state. The selection popover remains the
single contextual surface; it adapts its action groups instead of opening a second toolbar or nested popover.

## Header and Responsive Priorities

- **Desktop:** keep library access, arrangement identity/save state, primary playback, and frequent editing actions
  directly reachable. Use the available width for controls and context; overflow is for secondary actions, not the
  whole interface. Preserve keyboard shortcuts and focus navigation.
- **Narrow landscape:** retain the one-row header and visible primary playback. Compact labels and move secondary
  settings/actions into their associated menus before hiding primary entry points.
- **Mobile portrait:** prioritize library/navigation, a legible arrangement identity with save state, and the
  persistent playback toolbar. Use touch-sized controls and reachable contextual editing; expose collapsed playback
  controls through an obvious affordance. Do not make the score page itself scroll to reach app controls.

The responsive layout adapts density and disclosure, not the available functionality. Breakpoint values and final
dimensions are implementation details for later phases.

## State Matrix

| State | Primary controls and behavior |
|---|---|
| Reading | Playback and score navigation remain available; editing controls are absent. |
| Editing, no selection | Undo/redo and applicable entry tools; no selection-specific tools. |
| Editing, selection | Context shows applicable note/structure actions; mixed values are explicit. |
| Range placing | Hairpin/forte activates staff placing mode; active action is indicated and Escape exits. |
| Playback | Play/stop and current position remain visible; playback can coexist with reading or editing. |

Grid-specific and staff-specific actions remain distinct. Staff entry options are shown only in staff mode. Playback
position and duration continue to use the shared repeat-aware playback order; the presentation layer does not
reinterpret timing.

## Existing Control Inventory

- Header: library, display settings, user menu, arrangement identity/save state, new score, edit mode, save, undo/redo,
  print and export.
- Score context row: track/measure selectors and options.
- Instrument sidebar: always-visible icons and expandable per-track mixer, collapsed by default.
- Playback: play/stop, recording export, playback tempo, master volume, loop, count-in, metronome.
- Editing: entry mode, note length, articulation and note style in context.
- Selection actions: tuplets, simile and repeat marks share that contextual surface.
- Range tools: a separate floating toolbar offers only hairpin and forte (`f`).
- Score context: track/measure actions, selection actions, minimap, viewport navigation and zoom.
- Status: notifications, statistics/version, save/connectivity messages.

## Details to Refine

The playback toolbar may collapse secondary controls when space is limited, provided they remain easy to reopen on
desktop and mobile. Keep the instrument sidebar and its collapsed-by-default per-track mixer. Refine exact placement,
density, and visual treatment against later mockups; this text is a structural working template, not a finalized visual
specification.

## Constraints

Layout changes preserve viewer-local score element identity (ADR-0002), requisition-based cross-module state
(ADR-0004), data-driven measure widths and staff windowing (ADR-0009), and shared repeat-aware playback semantics
(ADR-0017). This document does not decide staff geometry or persistence for track heights; those belong to the
later geometry phases and their own agreed contract. Decide automatic versus manual staff heights in phase 6.
