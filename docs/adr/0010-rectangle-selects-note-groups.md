# ADR-0010: A selection rectangle selects the note groups it covers

- Status: accepted
- Date: 2026-09-22
- Related: ADR-0008, `src/components/ui/Bar/Staff/StaffMeasureViewer.tsx`,
  `tests/e2e/staff-selection.spec.ts`
- Relevant when: staff view, selection, hit testing, note groups, beams, tuplets, drag selection
- Supersedes: the ADR-0008 invariant "a selection covering markers of several groups of one track resolves at note
  granularity" and the consequence that states it

## Context

A rectangle over the markers of several groups resolved at note granularity: every event of every covered group
entered the selection. The rectangle covers markers, not notes, so it selected notes the user never touched — and
for tuplets nothing at all, as their events were resolved from a span no decoration drew. Clicks and
Shift-clicks select the group itself, so a drag behaved unlike the gestures beside it.

## Decision

We will keep every group a rectangle covers, as the group it is: each covered marker becomes a group entry of its
own, exactly as a click on that marker would.

## Invariants

- A rectangle over markers of several groups selects all of them, one entry per group, never the notes under them.
- The rest of ADR-0008 stands: notes keep priority over markers of their track, a selection never holds a group
  together with one nesting it, and group membership still comes from `MeasureProjection.noteGroups`.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| Keep the groups the rectangle covers | Chosen: what it covers is what gets selected. |
| Resolve several groups at note granularity | Rejected: it selects notes outside the rectangle, and nothing for tuplets. |
| Limit the drag to the group it starts in | Rejected: a range of groups could not be selected at all. |

## Consequences

- Positive: a drag selects groups as clicks and Shift-clicks do, spanning beams and tuplets alike.
- Trade-off: the rule of ADR-0008 is reversed, hence this ADR instead of an extension of it.
- Follow-up / verification: `tests/e2e/staff-selection.spec.ts` covers two beam groups in one rectangle.
