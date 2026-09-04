# ADR-0002: Resolve rendered score elements through a viewer-local typed registry

- Status: accepted
- Date: 2026-09-04
- Related: `src/ui/ScoreElementRegistry.ts`, `src/ui/SelectionView.ts`, `src/ui/TrackViewerInputController.ts`
- Relevant when: score rendering, selection, keyboard navigation, DOM integration

## Context

Grid and staff renderers previously serialized note identity into `data-*` attributes. Input and selection code
then reconstructed domain values by querying and parsing those attributes. The duplicated DOM contract was fragile:
a missing or inconsistent attribute could silently break cursor movement, note selection, or selection overlays.

## Decision

We will resolve rendered score elements through one typed `ScoreElementRegistry` owned by each
`ArrangementViewer`. Score renderers register their live elements through callback refs. Consumers resolve elements
and their locations through the registry instead of using `data-*` attributes as a production identity contract.

## Invariants

- A registered element is removed when Preact clears or replaces its callback ref.
- Tuplet slots remain individually addressable by their exact fractional start, even when they share a grid step.
- CSS selectors may be used for local visual structure and geometry, but not to serialize or recover score identity.
- `data-*` attributes may remain as test or debug hooks and must not be required by interactive production paths.

## Alternatives considered

| Option | Why not / why chosen |
|---|---|
| Viewer-local typed registry | Chosen because callback refs track Preact's DOM lifecycle and preserve domain typing. |
| Continue using CSS selectors and `data-*` | Rejected because it duplicates and stringifies domain identity across renderer and consumer boundaries. |
| Store a `RefObject` for every note in components | Rejected because ownership and cleanup become distributed across a large dynamic score tree. |

## Consequences

- Positive: identity lookups no longer depend on attribute spelling or string parsing.
- Trade-off: score renderers must receive the registry from their owning viewer.
- Follow-up / verification: retain focused registry lifecycle tests and test selection and keyboard navigation in both views.
