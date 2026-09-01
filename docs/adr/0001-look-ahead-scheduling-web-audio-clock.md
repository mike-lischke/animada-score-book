# ADR-0001: Use the AudioContext clock for playback scheduling

- Status: accepted
- Date: 2026-09-01
- Related: src/player/ArrangementPlayer.ts, src/player/AudioBufferPlayer.ts, src/player/Metronome.ts
- Relevant when: playback, transport, scheduling, timing, metronome, MP3 export

## Context

Playback must keep audio sample-accurate while also driving UI state (current bar/step, cursor animation).
Scheduling every note up front is wasteful for long and looping scores. Web Audio offers a sample-accurate
clock (`AudioContext.currentTime`) but no high-level transport.

## Decision

We will use a look-ahead scheduler in which the AudioContext clock is the single time authority.
`ArrangementPlayer` keeps an `offset` so that `AudioContext.currentTime - offset` equals score time.
A `setTimeout` loop repeatedly schedules the next short look-ahead window of events (audio, metronome,
timing callbacks). Audio and metronome events are placed sample-accurately on the Web Audio clock via
`AudioBufferSourceNode.start(time)` / `OscillatorNode.start(time)` at `offset + realTime`; timing callbacks
use `setTimeout` delays because UI does not need sample accuracy. Event queries use half-open intervals
`[start, end)` so a boundary event is emitted exactly once across look-ahead chunks. The look-ahead window
size and the timer interval are tunable implementation parameters, not part of this decision.

## Invariants

- Scheduled audio and metronome starts use absolute times on the `AudioContext` clock.
- JavaScript timers replenish the scheduling horizon; they do not determine the audible event time.
- Score time is mapped to AudioContext time through an explicit transport mapping and must not require wall-clock time (`Date.now`).
- Each scheduling query uses half-open intervals `[start, end)` so an event at a chunk boundary is scheduled at most once.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| Web Audio clock + look-ahead setTimeout loop | chosen because sample-accurate audio with bounded memory and low scheduling latency |
| Schedule the whole score up front | rejected because it schedules unnecessary nodes for long/looping scores and complicates stop |
| Drive everything from `setTimeout`/`Date.now` | rejected because timer jitter would cause audible timing drift |
| One scheduler for both audio and UI events | rejected because UI updates need no sample accuracy and coupling them adds no benefit |

## Consequences

- Positive: sample-accurate audio, constant scheduling latency, cheap stop (fade-out + clear timers).
- Trade-off: two timing mechanisms must stay consistent; chunk boundaries need float tolerance (Metronome).
- Follow-up / verification: `Metronome.spec.ts` and `AudioBufferPlayer.spec.ts` encode the boundary and start-time invariants.
