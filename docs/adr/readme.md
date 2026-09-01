# Architecture Decision Records

ADRs document only durable, cross-module decisions or invariants that would be
hard to infer from code alone.

## Rules

- ADRs live in this directory and use `NNNN-kebab-case-title.md`.
- One ADR records one decision.
- Status is `proposed`, `accepted`, `deprecated`, or `superseded by ADR-NNNN`.
- Do not rewrite accepted decisions to change history.
  Create a new ADR and mark the old one as superseded.
- Do not create ADRs for ordinary fixes, local refactorings, or implementation
  details.
- Keep ADRs concise: normally 200–400 words.

## Index

| ADR | Status | Decision | Relevant when |
|---|---|---|---|
| ADR-0001 | accepted | Schedule audio against the AudioContext clock and drive playback with a look-ahead scheduler | playback, transport, scheduling, timing |
