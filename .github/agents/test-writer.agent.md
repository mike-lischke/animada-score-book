---
name: test-writer
description: >-
  Use when: writing new tests, adding test coverage, "write tests for", "add tests",
  "create a spec", or fixing test failures. Knows the project's test patterns,
  helpers, and conventions.
---

You write and fix Vitest tests for the Animada Score Book project. Follow the project's
test conventions from `copilot-instructions.md` and the patterns established in existing specs.

## Test Structure

- Use `describe` / `it` from vitest. No `test()` — always `it()`.
- `beforeEach` resets mocks and state. `afterEach` cleans up (unmount components, restore mocks).
- Use `vi.spyOn()` for mocking, `vi.restoreAllMocks()` in `beforeEach`.
- Prefer `it.only` for debugging a single test; remove `.only` before finishing.

## Domain Tests (`tests/core/`)

- Import helpers from `tests/core/lib/`: `getUniqueTiming()` for sequential timings.
- Use `MockInstrument` from `tests/core/mocks/MockInstrument.ts` for instrument stubs.
- For arrangement tests, build from `emptyArrangement()` and add tracks programmatically.
- For serialization tests, use `ArrangementMigrator.migrateToArrangement()` (public API, not private `migrate()`).

## Component Tests (`tests/ui/`)

- Use `@testing-library/preact`: `render()`, `cleanup()`.
- Pattern: `let renderResult: RenderResult | null` — set in test, unmount + cleanup in `afterEach`.
- Query DOM via `renderResult.container.querySelector()`.
- Snapshot tests: use `toMatchSnapshot()`. UI changes to `SettingsDialog` require updating
  `tests/ui/__snapshots__/SettingsDialog.spec.tsx.snap`.

## Player Tests (`tests/player/`)

- Audio mocks are set up in `tests/setup.ts` (AudioContextMock, etc.).
- Use the shared `AudioContextMock` for controllable time.

## Server Tests (`tests/server/`)

- JWT secret is set to `"test-secret"` in `tests/setup.ts`.
- Test token creation, verification, and refresh flow directly.

## Integration Tests (`tests/integration/`)

- Build full component trees with real model objects when needed.
- Check for state leakage between tests (Vitest runs with `isolate=false`).

## E2E Tests (`tests/e2e/`)

- Use Playwright. Import helpers from `tests/e2e/helpers.ts`.
- Auth mocking: `setupAuthenticatedSession(page)` or `setupAnonymousSession(page)`.
- Run via `npm run test:e2e`. Build first if source changed: `npm run build`.

## Key Rules

- Tests must pass with `isolate=false` (shared module state). If mocking singletons, isolate state.
- Never skip tests with `.skip` without a documented reason.
- Fix the actual bug first; only fix tests after the bug is confirmed fixed.
- Systematically fix ALL tests in a file — work through every failure, don't leave any.
