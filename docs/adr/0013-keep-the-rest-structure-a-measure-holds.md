# ADR-0013: Keep the rest structure a measure holds instead of deriving it anew

- Status: accepted
- Date: 2026-09-25
- Related: ADR-0003, ADR-0006, ADR-0007, `src/core/ScoreBookDataModel.ts`,
  `src/components/ui/Note/StaffNoteViewer.tsx`
- Relevant when: rest length change, rests, measure layout, notation, staff view, whole-measure rest,
  gaps between events

## Context

A rest was only the gap between the timeline items (notes and subdivisions): every layout recomputed
all rests from those gaps, merged adjacent ones and split a gap into standard values. A measure
without any item therefore always held exactly one rest covering its bar.

That made a rest request a lie in a silence: giving a whole-measure rest a shorter length found no
content to move aside, the layout recreated the very same rest — and the edit still reported a change,
so it raised an undo step without a visible result. It also made a rest structure inexpressible: a
bar split into two half rests collapsed back into a whole rest at the next layout, and the staff view
drew a silent bar as one whole rest whatever it held.

## Decision

We will keep the rest structure a measure holds. A layout fills each gap with the rests that already
covered it when they still cover it exactly and differ from the split the gap would derive on its own;
any other gap is derived from its length as before. A length request shapes the measure's rests where
content alone cannot express it, and a measure holding more than one rest is drawn as its parts.

## Invariants

- A measure that holds nothing but one rest covering its bar is notated as a whole-measure rest; a
  measure holding notes, a subdivision or several rests is drawn as it stands.
- A rest structure the user shaped survives every layout as long as its rests still cover the same gap,
  and does not merge with the rests around it.
- A structure equal to the derived split stays unprotected, so adjacent rests still combine into one
  rest (replacing a note with a rest still yields a single rest).
- Subdivision slots are never rest structure of a measure: they belong to their subdivision alone.
- A length request always either moves content behind the rest or reshapes the measure's rests, so an
  edit that reports a change is a change.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| Keep a shaped structure (chosen) | Rests stay derived where nothing was shaped, while a rest the user split keeps its parts |
| Rests as timeline items | Rejected: it would turn notation into content everywhere, for edits that do not address rests |
| Keep deriving rests only | Rejected: a rest split was inexpressible and reported a change without one |
| Always keep the measure's rests | Rejected: it blocks the merge that makes a replaced note a single rest |

## Consequences

- Positive: rests can be shaped and are drawn as shaped; a rest edit in a silence is a real edit.
- Trade-off: the layout carries one more rule, and a shaped structure stays until the gap changes or
  the measure is cleared.
- Follow-up / verification: `tests/core/ScoreBookDataModel.spec.ts` covers splitting, keeping and
  joining rests; `tests/ui/StaffNoteViewer.spec.tsx` and `tests/e2e/staff-whole-rest-selection.spec.ts`
  cover the drawing.
