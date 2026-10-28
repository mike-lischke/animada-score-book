# Architecture and Decisions

This chapter maps the codebase. The reasoning behind it lives in the [architecture decision records](../../adr/readme.md) and the [design contracts](../../design/app-layout-contract.md); this page points at them instead of repeating them. Both stay in the repository and are not part of the deployment package.

## Repository Layout

| Directory                       | Content                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/core/`                     | Domain model: `ScoreBookDataModel`, `Arrangement`, `Track`, `Instrument`, timing and measure layout, clipboard, undo history |
| `src/core/serialisation/`       | Snapshot formats, URL and storage packing, migration of older arrangements                                                   |
| `src/player/`                   | Playback engine: `ArrangementPlayer`, `TrackPlayer`, metronome, time coordination                                            |
| `src/supplement/`               | Utilities: the typed event bus, escape stack, semaphore, MP3 export                                                          |
| `src/components/ui/`            | Feature components: arrangement, bars in both views, notes, tracks, header, footer, library, print                           |
| `src/components/ui/framework/`  | The in-house UI component library: base class, containers, dialog, menu, tree grid, tab view, popup                          |
| `src/ui/`                       | Top-level modules: score library, settings, login, selection and mode managers, editors                                      |
| `src/server/`                   | Backend: entry point, router, authentication, score and admin routes, static files, database adapters                        |
| `src/assets/`, `src/generated/` | Icons and instrument images; generated font metrics and theme CSS                                                            |
| `build/`                        | Build and maintenance scripts: font metrics, themes, migrations, packaging, seed data                                        |
| `migrations/`                   | The database schema as ordered SQL files                                                                                     |
| `public/`                       | Music fonts, sound samples, logo, uploaded files                                                                             |
| `tests/`                        | Unit, component, player, server, integration, and Playwright tests                                                           |

## The Application

`src/App.tsx` mounts the application and owns the long-lived objects: the data model, the arrangement player, the undo manager, and the managers for selection and modes. It also runs the start-up phase machine — checking, database setup, administrator setup, login, running — and switches between splash dialogs and the main layout.

Three patterns explain most of the code:

- **One data model, one mutation signal.** Every edit goes through `ScoreBookDataModel` or the objects it delegates to, and each edit fires `arrangementMutated` once. The undo manager listens to that signal and records one snapshot per edit, which is why one edit is one undo step.
- **Requisitions instead of direct calls.** Cross-component communication runs over a typed event bus (`src/supplement/Requisitions.ts`). Components register for topics such as `settingsChanged`, `playerStateChanged`, or `selectionChanged` instead of holding references to each other.
- **One view, two presentations.** The grid view and the staff view render the same score, and each has its own measure editor. Both implement the same hit-testing contract, so selection and keyboard input work in either view.

The UI is built on an in-house component library (`src/components/ui/framework/`). All components derive from `UIComponent`, layouts use `Container`, and styles are per-component SCSS files collected in one central index.

## The Playback Engine

Playback schedules audio against the `AudioContext` clock with a look-ahead loop rather than with timers per note (ADR-0001). `ArrangementPlayer` owns the transport and coordinates one `TrackPlayer` per track plus the metronome; `TimeCoordinator` converts between score time and real time for the playhead, the loop, and the Play Focus range. Repeat barlines are resolved before playback, so the performed order differs from the written one (ADR-0017).

## The Backend

- `backend.ts` loads the configuration, runs migrations, initializes the adapters, and starts the HTTP server.
- `Router.ts` dispatches on a flat `?action=` parameter and forwards to `AuthRoutes`, `ScoreRoutes`, `AdminRoutes`, or `StaticRoutes`.
- `Auth.ts` holds the permission model and the token handling; `RequestContext.ts` provides request parsing, CORS, proxy trust, rate limiting, and the refresh cookie.
- `mysql-adapter.ts` and `postgres-adapter.ts` implement one adapter interface. The schema itself lives in `migrations/`, not in the adapters.

## Decisions

The [index of decision records](../../adr/readme.md) lists every accepted decision together with a "relevant when" hint. The ones a contributor meets first are:

- [ADR-0001](../../adr/0001-look-ahead-scheduling-web-audio-clock.md) — scheduling against the audio clock
- [ADR-0004](../../adr/0004-requisitions-for-cross-module-state.md) — requisitions as the state channel
- [ADR-0005](../../adr/0005-per-view-measure-editors.md) and [ADR-0012](../../adr/0012-execute-input-through-active-measure-editor.md) — per-view editors and input routing
- [ADR-0009](../../adr/0009-measure-widths-and-staff-window.md) — measure widths and the rendered window
- [ADR-0014](../../adr/0014-smulf-font-for-standard-score-symbols.md) — SMuFL fonts for score symbols
- [ADR-0020](../../adr/0020-single-mutation-and-measure-layout-signals.md) — one mutation signal per edit

Two design contracts document agreements rather than decisions:

- [App layout contract](../../design/app-layout-contract.md) describes the surfaces and the wording the layout follows. It is a developer document and not a description of everything the application does.
- [Build output contract](../../design/build-output-contract.md) describes the chunk split, lazy loading, and the bundle budget.

## Tests

| Directory            | Content                                                        |
| -------------------- | -------------------------------------------------------------- |
| `tests/core/`        | Domain model, serialisation, migrations                        |
| `tests/ui/`          | Component and interaction tests with `@testing-library/preact` |
| `tests/player/`      | Playback engine and timing                                     |
| `tests/server/`      | Authentication and migration units                             |
| `tests/integration/` | Cross-layer tests such as font metrics                         |
| `tests/e2e/`         | Playwright specs against the production build                  |

`npm run test` runs everything except the Playwright specs. `npm run test:e2e` builds the application and serves it on `http://127.0.0.1:4173`, so end-to-end tests never run against the dev server.

## Related Chapters

- [Development Setup](setup.md) explains the commands and the two processes.
- [Maintaining This Documentation](documentation.md) covers the handbook conventions.
- [Architecture decision records](../../adr/readme.md) hold the reasoning behind the decisions above.
