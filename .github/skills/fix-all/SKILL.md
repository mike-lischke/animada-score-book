---
name: fix-all
description: >-
  Use when: the user says "fix all errors", "make everything green", "run all checks",
  "fix everything", or "green build". Runs the full CI pipeline — TypeScript check,
  ESLint, Vitest unit tests, and Playwright e2e tests — fixing errors at each stage
  before moving to the next.
---

# Fix All — Full CI Pipeline

Run each stage in order. Do not proceed to the next stage until the current one is fully green.
Fix errors at each stage — do not skip, ignore, or work around them.

## Stage 1: TypeScript (`npm run check`)

- Run `npm run check` and collect all errors.
- Fix every TS error across src/ and tests/. Common patterns:
  - Missing imports, wrong types, unused variables, strict null checks.
  - Tests use `tests/tsconfig.json` — check both tsconfigs.
- Re-run until zero errors.

## Stage 2: ESLint (`npm run lint`)

- Run `npm run lint` and collect all errors and warnings.
- Fix every lint issue. Do not disable rules with inline comments unless the rule is genuinely wrong for that line and the user approves.
- Re-run until zero errors and zero warnings.

## Stage 3: Unit Tests (`npm run test`)

- Run `npm run test` and collect all failures.
- Fix failing tests one at a time. Use `it.only` to focus on a single test while debugging, then remove `.only` and run the full suite.
- Tests may share module state (Vitest runs with `isolate=false`) — if a fix causes cascading failures, check for state leakage.
- Re-run until all tests pass.

## Stage 4: E2E Tests (`npm run test:e2e`)

- Build must be up to date: `npm run build` if source files changed.
- Run `npm run test:e2e` and collect all failures.
- E2E tests run against the production build (`dist/`), not the dev server.
- Re-run until all tests pass.

## Final Report

After all four stages pass, report:
- Number of errors fixed per stage
- Any files that needed non-obvious changes (explain why)
- Total time if available
