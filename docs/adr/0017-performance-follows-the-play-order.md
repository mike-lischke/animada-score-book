# ADR-0017: Play an arrangement in the order its repeat barlines state, not along the written timeline

- Status: accepted
- Date: 2026-10-01
- Related: ADR-0001, ADR-0006, ADR-0015, `src/player/PlaybackOrder.ts`, `src/player/TimeCoordinator.ts`,
  `src/player/ArrangementPlayer.ts`, `src/player/TrackPlayer.ts`
- Relevant when: playback, repeat barlines, transport, play range, playhead, score length, status bar, simile

## Context

Repeat barlines (`|:`, `:|`) make a bar sound more than once, but the written timeline that playback, transport,
playhead and status bar derived their times from addresses every bar once. Letting every consumer interpret the
marks itself would let them disagree about what is played.

## Decision

We will resolve the repeat marks in `PlaybackOrder.performedBars()` into a play order: written bar numbers in
performed sequence. A bar starts at its order index times the bar length, a note at that start plus its fraction of
the bar. Track players, play range, transport loop, playhead and status bar all work on this order.

## Invariants

- `PlaybackOrder` is the only code that interprets repeat marks for playback.
- The performed length is the number of performed bars times the bar length; without repeats it equals the
  written length.
- A one-bar repeat (ADR-0015) is resolved per written bar before the order places it, so both compose.
- Every consumer of performed time (scheduler, playhead, status bar) reads the same order and recomputes it on
  every arrangement or time parameter change.
- A pathological nesting cannot grow the order beyond a fixed multiple of the written bars.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| One resolved play order all consumers read (chosen) | One interpretation, linear cost, simple time math |
| Convert written positions and jump at repeat marks during scheduling | Rejected: the look-ahead scheduler (ADR-0001) and the playhead would each need the jump logic |
| Expand the repeated bars into the arrangement data | Rejected: duplicates content that editing and undo would have to keep in sync |

## Consequences

- Positive: repeats, nesting and similes play correctly, and every display agrees on length and position.
- Trade-off: a written position no longer maps to a single real time; position conversions go through the order.
