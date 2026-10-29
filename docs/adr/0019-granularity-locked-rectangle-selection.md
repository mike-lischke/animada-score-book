# ADR-0019: Represent selection as a granularity-locked filled rectangle

- Status: accepted
- Date: 2026-10-14
- Related: ADR-0002, ADR-0008, ADR-0009, ADR-0010, issue #54, `src/ui/SelectionManager.ts`
- Relevant when: selection, drag selection, selection granularity, Shift extension, staff virtualization
- Supersedes: ADR-0010 invariant that every rectangle covering multiple group markers selects each covered group,
  regardless of the gesture's starting element. The starting element now fixes the granularity for the gesture.

## Context

Selection entries could accumulate into disjoint blocks, and hit testing chose the finest granularity present anywhere inside a drag rectangle. This made selection meaning depend on incidental content and left popup placement ambiguous when selected content was outside the rendered staff window.

## Decision

We will represent the active selection as one filled rectangular range in score coordinates, materialized as the existing selection entries for consumers. A new drag replaces the range. Shift extends it to the smallest enclosing rectangle containing both the original selection and the new drag rectangle. The element at the start of a new range fixes its granularity; the anchor retains that granularity for later extensions. Ctrl/Cmd inversion is removed.

## Invariants

- The range has no gaps across its applicable event, track, and measure axes.
- Every entry in a range has the anchor's granularity.
- Extension includes every matching element inside the enclosing rectangle, not only newly hit elements.
- Selection coordinates come from the model; rendered DOM supplies hit geometry, not durable range identity.
- Popup placement uses rendered selected content and is refreshed when the staff window changes.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| Preserve disjoint blocks with a separate popup anchor | Rejected: it retains ambiguous multi-range editing semantics. |
| Toggle entries with Ctrl/Cmd | Rejected: inversion can create holes or disconnected regions. |
| Filled rectangle with fixed granularity | Chosen: one predictable range works across views and virtualized measures. |

## Consequences

- Positive: selection, editing, and popup placement share one contiguous range contract.
- Trade-off: Shift extension can include intervening content, and group selection may cover multiple events.
- Follow-up / verification: cover range materialization, persistence, both views, and virtualized popup positioning.
