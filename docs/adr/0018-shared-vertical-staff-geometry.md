# ADR-0018: Size each staff row from the notation its track holds, and share that geometry across the view

- Status: accepted
- Date: 2026-10-09
- Related: ADR-0002, ADR-0006, ADR-0009, ADR-0014, issue #52 (phase 6),
  `src/core/StaffRowGeometry.ts`, `src/core/StaffInk.ts`, `src/core/StaffNotation.ts`
- Relevant when: staff view, staff row heights, track heights, measure columns, prefix column, track controls,
  print layout, note ink, beams, tuplet markers

## Context

Every track row used one fixed height (`--note-height`, the grid cell size) plus a margin that also held a track's
below-tuplet room. A row whose notation needed more — a nested tuplet's marker, a tall beam — overflowed into the row
below, and the side columns compensated with fixed offsets that matched that one height. Grid cell size and staff
spacing were the same value.

## Decision

A staff row's vertical geometry is resolved per track from the notation it holds and stated by one model every column
reads. `StaffRowGeometry` measures all measures of a track, reusing the ink and beam rules of `StaffInk` and
`StaffNotation` — the ones the renderer draws with — and states the staff line's offset from the row's top, the row's
height and the band its range markings stand in. Note rows, prefix, track controls, edit sidebar and print instrument
cell state that height and anchor, so their rows align. The grid keeps its own cell height; the horizontal step width
is its own value.

## Invariants

- A track's geometry is the same for every measure it holds and never depends on which measures are rendered.
- A row's height holds the notation's ink, the room a tuplet marker needs, and the band its range markings stand in;
  it never falls below a least height, so a row stays a usable target and never overflows.
- The marking band sits below the notation's ink, so a hairpin or an `f` never reaches the accents below a head.
- Ink bounds and beam plan come from one authority shared with the renderer; the grid cell size and the step width are
  independent values.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| Geometry from all measures of a track | Chosen: a stable height that does not jump while scrolling. |
| Height from the rendered measures | Rejected: rows would resize while the score scrolls. |
| Grow the margin of the fixed height | Rejected: the margin belongs to one row, so a tall row still overlapped its neighbour. |
| Manual per-track resizing | Deferred: automatic heights first; where overrides live is a separate decision. |

## Consequences

- Positive: collision-free heights per track, side columns aligned without fixed offsets, grid cell size no longer
  driving staff spacing.
- Trade-off: the geometry is measured from all measures of a track, so it must be cached and dropped when the track's
  content, the arrangement or the timing changes.
- Follow-up: hit-testing, selection decoration and the playhead still read row rects (phase 7);
  `StaffRowGeometry.spec.ts`, `StaffInk.spec.ts`.
