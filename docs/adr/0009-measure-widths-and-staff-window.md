# ADR-0009: Measure widths are data and the staff view renders a window of measures

- Status: accepted
- Date: 2026-09-21
- Related: ADR-0002, ADR-0008, `src/core/MeasureLayout.ts`,
  `src/components/ui/Arrangement/ArrangementViewer.tsx`
- Relevant when: staff view, measure widths and layout, scrolling, selection decoration, hit testing, print

## Context

The viewer rendered every measure as live DOM — a 79-measure score with four tracks carried 26.000 nodes — so
view switches, re-renders and playback painting scaled with the song's length. A window of measures needs offsets
for measures it does not render, which the DOM cannot supply. Widths were a CSS result, and the views disagreed
about them. The planned resize feature needs them as data anyway.

## Decision

We will make the column width of a measure data. `MeasureLayout` resolves a measure's width — its own or the
view's default — and derives the offsets, the total width and the measure at a position from it. The staff view
renders only the measures its window covers, at those offsets, with spacers keeping the scrollable width stable;
the grid view keeps rendering all measures.

## Invariants

- A rendered measure column has exactly the width `MeasureLayout` reports, so layout offsets match rendered
  geometry and a scroll position means the same with and without rendered measures.
- The window comes from state known while rendering — viewport plus overscan — never from the DOM, and never
  from a later update.
- Decoration of rendered measures is redone in the task that mounted them (`staffWindowChanged`).
- The registry still means "mounted now" (ADR-0002): a measure that may not be rendered is resolved from the
  measure layout.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| Widths as data plus a window | Chosen: offsets must be known before rendering. |
| Offsets from rendered geometry | Rejected: unrendered measures have no geometry. |
| Pinning the selection's measures | Rejected: it stretches the window over everything in between. |

## Consequences

- Positive: view switches, re-renders and painting scale with the visible measures, not with the song's length.
- Trade-off: a measure can no longer be addressed by DOM lookup alone; code needing it goes through the measure
  layout, or scrolls it into the window.
- Follow-up / verification: `MeasureLayout.spec.ts`, staff e2e helpers that scroll a measure into the window
  first, print honouring stored widths.
