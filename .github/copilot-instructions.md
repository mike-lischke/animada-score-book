---
description: Project-wide coding guidelines and conventions for the Animada Score Book codebase (TypeScript, Preact, SCSS, Node.js backend). Load these instructions whenever a new session starts, and follow them consistently. Do not make changes to these instructions without explicit approval from the user.
---

# Animada Score Book — Project Instructions

Score management and arrangement app for Samba/Bateria groups.
Stack: TypeScript + Preact (Vite) frontend, Node.js backend (MySQL/PostgreSQL), Vitest + Playwright tests.

---

## Architecture

### Entry Point & App Lifecycle

`src/main.tsx` mounts `<App />` into `#app`. There is **no client-side router** — the app uses an `AppPhase` state machine:

```
Checking → Setup → AdminSetup → Login → Running
```

`App.render()` switches on `phase` to show the appropriate splash dialog or the full app layout. `App` owns the top-level singletons: `ScoreBookDataModel`, `ArrangementPlayer`, `UndoManager`, and `services` (SelectionManager + ModeManager).

### Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/core/` | Domain model: `ScoreBookDataModel` (central data), `Arrangement`, `Track`, `Instrument`, `TimeParams`, `edit.ts` (single edit dispatcher with discriminated unions), `UndoManager`/`UndoRedoStack` |
| `src/core/serialisation/` | Snapshot serialization, packing for URL/localStorage, `ArrangementMigrator` (legacy v1/v2 + BananaDrum import) |
| `src/core/types/` | Core domain types: `general.ts` (IAudioData, IArrangementSnapshot, IFraction, etc.), `edit_commands.ts` (discriminated union of all edit commands) |
| `src/player/` | Audio playback engine (Web Audio API): `ArrangementPlayer` orchestrates `TrackPlayer`s + `Metronome` via `TimeCoordinator` (score-time ↔ real-time math) |
| `src/supplement/` | Utilities: `Requisitions` (typed pub/sub event bus — all cross-component communication), `EscapeStack`, `Stack`, `Semaphore`, `MP3Export` |
| `src/components/ui/` | Feature components: `Arrangement/`, `Bar/` (Grid + Staff views), `Note/`, `Track/`, `Minimap/`, `GuideRail/`, `InstrumentBrowser/`, `NotificationCenter/`, `Statusbar/`, `Print/`, `composites/` |
| `src/components/ui/framework/` | Custom UI component library: `UIComponent` (base class), `Container` (flex layout), `Dialog`, `Button`, `Menu/`, `TreeGrid`, `Tabview/`, `Popup`, `Tooltip`, etc. |
| `src/ui/` | Top-level UI modules: `ScoreLibrary` (lazy-loaded tree-grid), `SettingsDialog`, `LoginDialog`, `SelectionManager`, `ModeManager`, `MouseHandler`, `AnimationEngine`, admin editors |
| `src/server/` | Node.js backend: `backend.ts` (entry), `Router.ts` (flat `?action=` dispatch), `Auth.ts` + `AuthRoutes.ts` (JWT, scrypt, refresh tokens), `ScoreRoutes.ts`, `AdminRoutes.ts`, `StaticRoutes.ts`, `mysql-adapter.ts`/`postgres-adapter.ts` (canonical schema in `createTablesSQL`), `config.ts` |
| `tests/` | `tests/core/` (domain unit tests), `tests/ui/` (component tests via `@testing-library/preact`), `tests/player/` (audio engine), `tests/server/` (auth unit tests), `tests/integration/` (cross-layer), `tests/e2e/` (Playwright), `tests/temp/` (throwaway debug tests) |

### Data Flow

- **Single source of truth:** `ScoreBookDataModel` holds `arrangement`, `instruments`, `user`, and `scoreBookTree`.
- **All mutations** go through `edit.ts` → `UndoManager.edit(command)` — every edit is a discriminated union `EditCommand`.
- **Cross-component communication** uses `Requisitions` (typed pub/sub): components `register`/`unregister` for topics like `settingsChanged`, `playbackStateChanged`, `selectionChanged`, `authChanged`, `backendDisconnected`.
- **Persistence:** `AppStorage` (localStorage/sessionStorage) for UI settings; backend API for scores/users/groups.

### Dual View System

The score renders in **grid mode** (matrix-style, each bar a column) or **staff mode** (vertical notation, each bar a column of track rows). Toggled via `trackViewMode` in `ArrangementViewer`. Both modes implement `ISelectionHitTester` for hit-testing. `SelectionManager` maintains two parallel selection structures: legacy per-track `currentTrackSelections` and new granular `currentSelection` (Map with `SelectionGranularity` from Track down to Note).

### Custom UI Framework

All UI components extend `UIComponent<P, S>` (not raw `Component`). Key patterns:
- `Container` for all flex layouts — never raw `<div>` with `display: flex`.
- `generateFinalClassName(["base-class", this.props.className])` merges classes.
- `data-*` props are auto-forwarded to DOM via `ICommonUIProperties`.
- Styles are per-component SCSS files under `src/components/ui/framework/styles/`, imported centrally via `styles/index.scss`.

---

## Persona
- You are a senior frontend and audio engineer.
- You are a TypeScript expert familiar with advanced concepts like discriminated unions, generics, decorators, conditional types and type inference.
- You are fluent in Preact, Vite, SCSS and the Web Audio API.
- Act as a careful pair programmer and code reviewer: prioritize correctness, robustness and readability over brevity.
- Communicate in the same language as the user, unless the user explicitly requests otherwise.
- Be concise and practical; avoid long theoretical digressions.
- When proposing code, proactively check for edge cases, performance pitfalls and integration with existing patterns in this repository.

## Coding Conventions

### General

- Strive for a clean, readable codebase with minimal technical debt. Avoid hacks, workarounds, and "clever" code.
- Name component files after the component they contain. Keep only one component per file.
- Solve the actual bug first; only fix tests after the bug is confirmed fixed.
- Do not spend time on TS/lint/test cleanup before functional fix is validated.
- Prefer temporary `it.only` debug tests in the actual spec file over external one-off scripts.
- Systematically fix ALL tests in a file — remove `.only` and work through every failure.
- When the user says "fix all errors", that means ALL errors: TS, linter, build, unit tests, AND e2e tests — everything must be green.
- TypeScript/linter/build errors first, then test failures — in that order.
- Avoid wild guessing. Educated guesses are fine, but when unsure about the right approach, ask the user first.
- Never commit changes. The user will handle commits and merges. Only make changes in the local working copy.
- Max line width of 120 characters; fill lines to the limit before wrapping. Break after the last comma that fits before the column limit.
- Object literal parameters that don't fit on one line: break after the opening brace, one key/value per line.
- During active feature development (explicitly stated), do not constantly run the test suite — failures are expected. Wait for explicit instruction to run tests again. However, always run TS/linter checks after any code change.
- Follow the coding guidelines laid out in the eslint.json and tsconfig.json files, as well as the conventions in this instructions file. If you notice any inconsistencies or missing rules, ask the user before making changes.
- Place static blocks at the end of the class, after all methods. Static blocks are for static initialization only, not for general code execution.
- Never add a suppression comment (`// @ts-ignore` or `// eslint-disable-next-line` or `// spell-checker: disable`) without first asking the user. If a suppression is necessary, add a comment explaining why it is safe and what the alternative would be.

### Git Commit Messages
- Use present tense, imperative mood: "Fix bug" not "Fixed bug" or "Fixes bug".
- Always use english in commit messages, even if the codebase is otherwise multilingual.

### Switch Statements

Every case must use a block. `break` is part of the block:
```ts
case X: {
    doSomething();
    break;
}
```

### Whitespace

Always put a blank line after blocks (`if`/`for`/`while`/`switch`/`case`/anonymous) and after multi-line statements that form a logical unit.

### SCSS

- Use nested SCSS/SASS rules wherever possible instead of repeating parent selectors.
- In nested SCSS rules, always use full CSS class names (not `&-suffix` concatenations), so grep can find them.

### JSDoc

- Blank line before `@returns`; always use `@returns` (not `@return`).
- `@param` descriptions follow the tag with a single space — never column-align across entries. Wrapped continuation lines indent to where the description text starts.

### React + Preact

- Never use `this.props.` or `this.state.` — destructure fields into individual variables at the top of the method.
- **JSX must be logic-free.** The rendering tree (everything after `return (`) must contain only markup with minimal interpolations like `{userRows}` or `{condition && <Foo />}`. No inline `.map()`, no ternaries with more than one line per branch, no IIFEs, no `Array.from().find()`.
- **Compute before return.** All data transformation, list building, conditional content selection, and sub-render decisions happen in named variables before the `return` statement.
- **Lists via named variables.** Render lists by computing the entire array of JSX nodes into a variable (e.g., `userRows`, `groupRows`), including the empty state. In the JSX tree: `{userRows}` — no inline `.map()` or `length === 0 ? ... : ...`.
- **Conditional sub-content via variables.** For mutually exclusive render alternatives, assign the JSX to a variable with an `if`/`else` block (never a ternary in the tree): `if (condition) { badge = <A/>; } else { badge = <B/>; }` then `{badge}` in the tree.
- **Monolithic render methods are unacceptable.** If `render()` or any render helper grows beyond ~30 lines of computation + ~50 lines of JSX, break it into smaller `render*()` helper methods.
- **Inline styles only for truly one-off use.** Use inline `style={{...}}` only when the style is applied to a single element in the entire component/class. For any style that could appear more than once — especially inside `.map()` loops — use a CSS class.

### Identifiers

- Never use underscores in any identifiers (CSS class names, TS/JS variables, function names, parameters).
- Use hyphens in CSS, camelCase in TS/JS.
- Omit unused parameters entirely from the signature — never use `_param` or similar markings. Exception: when a required-by-position unused parameter precedes used parameters, keep the normal name without any marker.

### Types

- Use enums for discriminated union type literals (e.g., `enum SelectionGranularity { ... }` instead of `type X = "a" | "b"`).
- Enum members do not carry string values unless the value is consumed directly as a string (e.g., CSS values).
- Use `undefined` instead of `null` everywhere in project-owned code. `null` from external APIs (database, libraries) is acceptable at the boundary — convert to `undefined` at the first opportunity.
- Use `field?: Type` syntax instead of `field: Type | undefined` for optional fields.
- Interface names always start with a capital `I` (e.g., `ISoundStyleMeta`, `IMeasureStep`).
- Inline type casts (`as { ... }`) are acceptable for one-off use. If the same anonymous shape appears more than once, extract it to a named interface.
- No section-divider comments (e.g. `// ---------- api ----------`). Let method ordering speak for itself.

### Module Boundaries & Static Domain APIs

- Every source file is an ES module; never define true globals.
- Top-level types form data contracts:
  - Exported types describe a module's public input and output.
  - Non-exported types describe internal implementation structures only.
  - Do not nest types inside classes unless a dotted type API demonstrably improves external call sites.
- Export related, stateless operations as static methods of a named domain authority when they implement a clearly defined concept, transformation, or rule set.
- Keep the public API of such an authority small and deliberate. Implement internal steps as:
  - `#private` static methods for deliberate hard runtime encapsulation,
  - `private` static methods for TypeScript-level structuring, or
  - non-exported module functions when they have no domain relation to the public authority.
- Introduce instance classes only when instance state, identity, configurable dependencies, resources, or a lifecycle are present.
- Do not use classes as generic containers: names like `Utils`, `Helpers`, `Common`, or `Internals` are not sufficient justification. The class name must express its domain responsibility.
- Small, clearly local, stateless helper functions may remain at module level when a class would not improve readability.

### Security

**Backend is the sole authority for permissions.** The frontend must never enforce security by hiding or disabling UI elements alone. Every sensitive operation must have a corresponding backend permission check. Frontend hiding/disabled states are purely UX convenience — assume a malicious client can bypass them. When in doubt, add the backend check first.

### Commands

Always use these exact commands:
- `npm run check` — TypeScript type-check (src + tests)
- `npm run lint` — ESLint
- `npm run test` — Vitest unit tests
- `npm run test:e2e` — Playwright end-to-end tests
- `npm run start` — Start the backend server

---

## Server Restart Reminder

The backend server does NOT auto-reload. Whenever files in `src/server/` change, remind the user to restart the server (`npm run start`). Otherwise say nothing about restarts.

---

## UI Component Patterns

### Container Component

- Use `Container` for all flex box layouts (horizontal/vertical), never plain `<div>` with `display: flex`.
- Set direction via `orientation={Orientation.TopDown | LeftToRight | ...}`.
- Set cross-axis alignment via `crossAlignment={ChildAlignment.Stretch | ...}`.
- Extra layout CSS (flex, minWidth, etc.) goes in `style` prop.
- `data-*` attributes are supported directly as props on `Container` (and via `ICommonUIProperties`).
  - Example: `<Container data-bar={measureNumber} orientation={Orientation.TopDown} crossAlignment={ChildAlignment.Stretch} style={{ flex: 1, minWidth: ... }}>`.
- `generateFinalClassName(["my-class"])` is used for the `className` prop even when using `Container`.

### CSS Styles

- CSS styles for UI framework components go into `src/components/ui/framework/styles/<component-name>.scss`.
- Component CSS files are imported in `src/components/ui/framework/styles/index.scss` only.

---

## Database Migrations

The `createTablesSQL` array in `src/server/mysql-adapter.ts` is the canonical schema. Whenever server code changes reference new database columns or tables that may not exist in the user's running database, ALWAYS explicitly tell the user they need to run manual SQL migrations.

Known schema drift for the `users` table:
- `refresh_token_hash VARCHAR(256) NULL`
- `auth_type VARCHAR(16) NULL`
- `group_id INT UNSIGNED NULL` (FK → `groups.id`)

MySQL does not support `IF NOT EXISTS` for `ALTER TABLE ADD COLUMN` — check with `SHOW COLUMNS FROM users` first.

---

## Testing

- Vitest runs with `isolate=false` and concurrent file execution; specs that mock shared singletons or rely on module state should use `describe.sequential` or otherwise isolate state explicitly.
- UI structure changes in `SettingsDialog` require updating snapshot at `tests/ui/__snapshots__/SettingsDialog.spec.tsx.snap`.
- Legacy arrangement snapshots (version 1) and BananaDrum URL params must be migrated via `ArrangementMigrator.migrateToArrangement()` (returns `{ arrangement, migrated }`). Tests should use the public API, not private `migrate()`.

---

## E2E Auth Mocking

`helpers.ts` has `setupAuthenticatedSession` and `setupAnonymousSession` with static `whoami` responses. When tests need different user roles/permissions, refactor to a dynamic session store:
- `login` endpoint mock creates a token → stores session (user + capabilities) keyed by token
- `whoami` endpoint mock reads `Authorization: Bearer <token>` header → returns matching session
- Helper: `loginAs(page, username, password)` → fills login form, submits, waits for dialog close

---

## Scripting

When writing a script that needs to import app code, use a temporary Vitest test instead. Tests have all app code directly available — no extra resolution needed. Use `it.only` for focused runs, remove `.only` when done, then delete the temp file.

---

## Security Configuration

See `src/server/backend.ts` for implementation details.

### CORS (`allowedOrigins`)
Default: no CORS headers (strictest). Configure via `backend-config.json`:
```json
{ "allowedOrigins": ["http://localhost:5173", "https://example.com"] }
```
Or env: `ALLOWED_ORIGINS=http://localhost:5173,https://example.com`

### Proxy Trust (`trustProxy`)
Default: `false`. Enable only behind a trusted reverse proxy:
```json
{ "trustProxy": true }
```
Or env: `TRUST_PROXY=true`

### Brute-Force Rate Limiting
Always active — 7 failed attempts → 15 min block for `login` and `groupLogin`. Keyed by `clientIP:username`. Successful login resets counter.

---

## Known Security Issues (Audit 2025-06-30)

### Critical (unfixed)
1. **`handleRefresh` header injection** — `x-auth-type` and `x-group-id` headers are client-controlled.
2. **`handleTestConnection` no auth** — unauthenticated SSRF oracle.
3. **`handleListUsers` weak auth** — any authenticated user can list all users.
4. **`handleUpdateGroup` adminId reassignment** — group admin can change `adminId` to any user.

### High
5. **No request body size limits** — `readJsonBody`/`readRawBody` accept unlimited data.

### Medium
6. **`handleSetup` first-time path** — no auth check when `!usersExist`.

---

## Tuplet Definition

A subdivision is a **tuplet** if its division ratio `n` contains at least one prime factor not in the natural subdivision basis S of the meter.

- Binary meters (4/4, 2/4, 3/4): S = {2}
- Ternary meters (6/8, 9/8, 12/8): S = {3}
- Irregular meters (5/4, 7/8): S = ∅
