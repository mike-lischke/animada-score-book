# ADR-0006: Address notes by fractions and render sub-step notes as a synthetic grid subdivision

- Status: accepted
- Date: 2026-09-17
- Related: ADR-0002, ADR-0003, ADR-0005, `src/core/ScoreBookDataModel.ts`, `src/ui/GridMeasureEditor.ts`,
  `src/components/ui/Bar/Grid/GridMeasureRow.tsx`
- Relevant when: note entry, note length change, subdivisions, note addressing, grid vs. staff behaviour, step resolution

## Context

Thirty-second notes must be enterable in the staff view, but a grid view cell displays exactly one grid step.
The data model addressed notes through integer step indices (`measureTimeline`, `stepsFromFraction`), so a value
finer than a step was inexpressible and the grid's column raster implicitly owned the model's edit API. The staff
view has no raster at all: it places notes at free fractions and only aligns them to grid points for the eye.

## Decision

We will let the raster be a grid concern and address notes by fractions everywhere else. The model's edit APIs
work on `IFraction` positions and durations and ripple content over an internal absolute timeline of the track
(`IAbsoluteNoteEvent`, with `absolutePositionOf`/`measureIndexAt` mapping between a measure position and a track
position). The grid renders a step whose events start inside it as a subdivision of that step
(`subdivision grid-sub-step`), purely presentational, so values below the raster still get a column each.

## Invariants

- An event's `start` and `duration` are fractions of their measure; no model API takes or returns a step index for
  a note position. `stepResolution` survives because a real subdivision records how many steps it replaces
  (`normal`).
- A synthetic sub-step exists only in the DOM and in selection addressing (negative slot ids for rests). It never
  reaches the model, a snapshot or the undo stack; only `createSubdivision` writes a real subdivision.
- A step shows at most a pair of thirty-seconds, so the subdivision limit follows note lengths: a span offers as
  many slots as fit into it in thirty-seconds.
- Cross-measure edits carry content over bar lines and cut the track's tail; every measure keeps tiling its meter.
- Rests the model writes are always single standard note values (`decomposeRestSpan`), because the staff view draws
  each rest with one glyph.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| Fractions plus a synthetic sub-step | Chosen: the raster stays a grid detail while both views address the same model. |
| Raise the raster to sixty-fourths | Rejected: it would push a display decision into every snapshot and halve the width of all cells. |
| Store a subdivision for a pair of thirty-seconds | Rejected: it turns a display artefact into score content and shows up in undo and snapshots. |
| Clip sub-step events into the step's cell | Rejected: two thirty-seconds would read as one note and could not be selected apart. |

## Consequences

- Positive: every note value is expressible in the staff view, while the grid keeps fixed cell widths and its own
  projection.
- Trade-off: the grid shows notes the model holds no subdivision for, so `subdivision` and
  `subdivision grid-sub-step` must be told apart when reading a row.
- Follow-up / verification: `GridMeasureRow.spec.tsx`, the three measure-editor specs,
  `SubdivisionToolbar.spec.tsx`; the thirty-seconds per step limit is what keeps the raster displayable.
