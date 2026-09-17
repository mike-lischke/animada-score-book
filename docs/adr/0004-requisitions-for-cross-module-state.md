# ADR-0004: Publish state changes as requisitions instead of setting them on other classes

- Status: accepted
- Date: 2026-09-10
- Related: ADR-0002, `src/supplement/Requisitions.ts`, `src/ui/SelectionManager.ts`, `src/ui/SelectionView.ts`
- Relevant when: communication between components and managers, state that several modules need, adding a setter or a direct call

## Context

Modules across layers need to react to each other's state: edit mode, playback state, selection.
Direct calls — a public setter or a mutable field on a foreign object — bind the caller to the
receiver's API and reintroduce the dependency the event bus exists to prevent; cycles become possible
again.

A concrete failure shows the second half of the problem: `SelectionView` learns the edit mode only
from `editModeChanged`, but it is created when the arrangement viewer mounts, which can happen after
the app published the current state. The view therefore started with `editMode === false` and the
selection overlay lost its delete button. Setting the state with a setter would have fixed the
symptom while recreating the coupling that caused the confusion in the first place.

## Decision

We will send a requisition for every state change other modules need, and treat direct calls as the
exception. A class that depends on a published state keeps its own copy, updated by its handler.
Objects it creates later (views, helpers) are constructed from that remembered value.

## Invariants

- A new cross-class interaction starts as a requisition (`requisitions.execute`), never as a setter on
  a foreign object.
- No class writes another class's state from outside; the owner registers a handler and stores what it
  received.
- A long-lived owner registers the handler in its constructor, so it cannot miss a state published
  before its short-lived children exist.
- Objects created later receive the remembered value through their constructor, not through a method
  call.
- Every handler is unregistered in `dispose`.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| Requisition plus remembered value | Chosen: decoupled, and the state has exactly one owner. |
| Public setter on the manager | Rejected: couples the caller to the receiver and reintroduces cycles. |
| Query a global or singleton | Rejected: hidden dependency, no notification, order-dependent code. |
| Let the child register earlier | Rejected: the child does not exist yet; the long-lived owner must carry the state. |

## Consequences

- Positive: dependencies stay one-directional and the state lives where the lifetime fits.
- Trade-off: the value exists twice for a moment (owner and handler copy); a handler that only
  remembers a state must stay that simple.
- Follow-up / verification: `SelectionManager` remembers `editModeChanged` and passes it on to
  `new SelectionView(...)`; the overlay delete button is verified in both views after loading a score
  while edit mode is active.
