# ADR-0015: Keep a one-bar repeat as a mark on the track piece and resolve it in playback

- Status: accepted
- Date: 2026-10-01
- Related: ADR-0006, ADR-0013, #47, `src/core/Track.ts`, `src/player/PlaybackOrder.ts`,
  `src/components/ui/Note/StaffNoteViewer.tsx`
- Relevant when: one-bar repeat, simile, track piece, measure content, playback, snapshot schema, migration

## Context

A one-bar repeat (simile) says that a track plays what the measure before it plays. The staff view draws a mark
instead of notes, and playback must follow the chain however many similes stand in a row. The events of a measure
are its single source of truth for what sounds: they tile the measure, they are what the projection turns into
notation, and every editor addresses them. A simile sounds something but holds nothing of its own, so it cannot
be one of those events, and it must not hide content either.

## Decision

We will keep the mark on the track piece — `ITrackPieceSnapshot.simile` in the core snapshot (schema 6) and its
runtime counterpart — and resolve it in playback instead of in the measure content. Setting the mark empties the
piece's content; clearing it leaves an empty piece. Playback resolves the chain in one forward pass, and the views
draw the mark instead of the piece's notation.

## Invariants

- The mark belongs to a track piece, never to a bar as a whole and never to the first piece of a track.
- A piece that carries the mark holds a whole-measure rest and no subdivisions; no content hides behind it.
- A simile plays the nearest preceding piece that is not itself a simile, re-timed to the simile's own position,
  however long the chain is; the resolution costs one pass over the track.
- The resolved render events stay the piece's literal content; playback reads a separate list, so no mark reaches
  selection, hit testing or an editor as a note.
- The mark travels with the piece through snapshots, undo, the clipboard and the structural edits.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| Mark on the track piece (chosen) | The events stay the one source of truth for what sounds, while the mark is notation the piece carries |
| An event in the events tiling | Rejected: it breaks the tiling every projection, editor and rest rule relies on |
| An extension chunk | Rejected: the mark is core notation, not a feature that owns a chunk |
| Hiding the piece's content behind the mark | Rejected: invisible state that would still be drawn and edited elsewhere |

## Consequences

- Positive: a simile is ordinary core data, and any number of similes resolves in linear time.
- Trade-off: the snapshot version rises to 6 and older scores need a migration; the render paths gain a branch.
- Follow-up / verification: start and end repeat barlines resolve playback order at bar level and extend this
  authority; `PlaybackOrder`, the model's simile mutation and the staff and grid viewers cover the feature.
