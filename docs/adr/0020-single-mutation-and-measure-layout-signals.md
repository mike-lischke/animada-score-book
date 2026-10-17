# ADR-0020: Publish one mutation signal per edit and one view-only signal for measure layout

- Status: accepted
- Date: 2026-10-17
- Related: ADR-0004, issue #52, `src/supplement/Requisitions.ts`, `src/core/ScoreBookDataModel.ts`
- Relevant when: arrangement edits, undo recording, autosave, viewer refresh, measure resize, new requisitions

## Context

The arrangement published two overlapping signals. `arrangementChanged(arrangementId)` fired from the arrangement
model for every structural change and from `setMeasureWidth` on every frame of a width drag. `arrangementMutated`
fired once per finished edit from the public data-model API. A single edit therefore notified receivers twice, and
five receivers listened to both paths. The arrangement id in the payload existed only to detect that a different
score had been loaded — a fact the model already publishes as `scoreBookLoaded`.

## Decision

We will send `arrangementMutated` once per finished edit and make it the only signal that an edit is complete.
Viewers, players, toolbars, undo recording, and autosave all react to it. `arrangementChanged` is removed.
A per-frame measure resize publishes the view-only `measureLayoutChanged`, which no undo, autosave, or toolbar
receiver listens to. Undo, redo, and discarding changes publish `arrangementReverted`, so a replaced snapshot
reaches the same viewers without looking like a new edit. Loading a score stays `scoreBookLoaded`.

## Invariants

- One edit produces exactly one `arrangementMutated`; it is the undo boundary and the autosave trigger.
- `setMeasureWidth` publishes only `measureLayoutChanged`; a resize gesture ends with one `arrangementMutated`.
- `measureLayoutChanged` stays view-only: no receiver may record, persist, or re-read structure on it.
- `applyArrangementSnapshot` publishes nothing itself; undo, redo, and discard publish `arrangementReverted`.
- Receivers that mirror arrangement structure listen to both `arrangementMutated` and `arrangementReverted`.
- No payload carries an arrangement id; a receiver reads the current arrangement from the data model.

## Alternatives considered

| Option                                                      | Why not / why chosen                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| One mutation signal plus a view-only layout signal          | Chosen: one edit, one notification, one undo step.                |
| Keep `arrangementChanged` beside `arrangementMutated`       | Rejected: duplicated notifications and receivers listening twice. |
| Let `applyArrangementSnapshot` publish `arrangementMutated` | Rejected: undo would re-enter undo recording.                     |

## Consequences

- Positive: one meaning per signal; new receivers register once and cannot split an edit in two.
- Trade-off: a receiver that mirrors structure registers for two topics instead of one.
- Follow-up / verification: width tests observe `measureLayoutChanged`; undo and discard refresh every viewer.
