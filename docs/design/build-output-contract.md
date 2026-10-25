# Build Output Contract

- Status: accepted as the working policy for the production bundle; introduced for issue #57
- Scope: chunk layout, size budget, and the checks that enforce them

## Chunk Layout

`vite.config.ts` divides the bundle with `chunkGroups`: one explicit package per third-party pattern, plus the app's
domain layer as a chunk of its own.

| Chunk                                                                | Contents                                    | Load    |
| -------------------------------------------------------------------- | ------------------------------------------- | ------- |
| `index`                                                              | App shell, UI and wiring                    | initial |
| `core`                                                               | `src/core` — the stable domain layer        | initial |
| `vendor`                                                             | `preact`, `@mdi/js`, `classnames`           | initial |
| `tabulator`                                                          | Tabulator, used by the score library        | lazy    |
| `mediabunny`                                                         | mediabunny core, shared by both MP3 imports | lazy    |
| `mediabunny-mp3-encoder`                                             | MP3 encoder bundle                          | lazy    |
| `ScoreLibrary`, `MP3Export`, `bateria-instruments`, `support-sounds` | own dynamic imports                         | lazy    |

Rules:

- A library gets an entry in `chunkGroups` only when its chunk name matters, and then as a single explicit package.
  A pattern over all of `node_modules` moves Vite's preload helper into a lazy chunk, which makes the entry chunk
  import that chunk — and everything in it — eagerly.
- Keep lazy code lazy: a module only an `import()` reaches must not be imported from the entry chunk.
- Judge a chunking change by building and comparing the entry chunk, never by the chunk names or the grouping alone.
  Isolating a module can pull shared modules into the isolated chunk.

## On-Demand Code

Startup loads only what the running app shows by itself. Everything the user has to ask for is imported on first use:

- `PrintPreview` and `PrintDocument` are `lazy()` components behind `Suspense`. `PrintDocument` reports `onReady`
  once it is in the DOM, and `App.startPrint()` waits for that before `window.print()` — without the handshake the
  native dialog would snapshot an empty page.
- The grid and the staff view stay **eagerly** imported, although only one of them is ever visible. Loading the
  inactive one on demand leaves the viewer without measure DOM for a render, and it measures the playhead and the
  staff rows against it: the e2e suite shows a playhead 37 px off, missing staff prefix lines and Preact reporting
  the suspended promise as an uncaught rejection. The ~28 kB it would save are not worth that.
- `SettingsDialog`, `UserGroupEditor`, `PermissionEditor`, `TutorialWizard` and `ReleaseNotesDialog` are not mounted
  until they are opened. `App` stores the imported component in its state and opens it in the `setState` callback, so
  the dialog is in the DOM before its `open()` runs. Once loaded they stay mounted, as their `open()` API expects.

A dialog that is added to `App` later follows the same pattern; an always-mounted dialog silently keeps its whole
module graph in the initial bundle.

## Size Budget

The `bundle-budget-check` plugin in `vite.config.ts` runs `BundleBudget.verify()` (`build/BundleBudget.ts`) at the end
of every `vite build`. It reads `dist/.vite/manifest.json` (`build.manifest`) and fails the build when

- any single emitted file exceeds 500 kB raw — the limit Vite itself warns about, so the warning never gets ignored, or
- the initial load — entry chunk, its static imports and their CSS — exceeds 210 kB gzip.

Sizes use decimal kB, like Vite's reporter, so a chunk's number is the same in both outputs. Raw sizes bound the
individual chunks; the initial load is measured gzip because that is what the browser downloads. The check stays
quiet while the bundle fits — Vite's own chunk table is where to read the sizes — and a violation fails the build with
the full size report attached. The font verification behaves the same way: it only speaks up when a font is broken.

Raising a budget is a deliberate decision: change `BundleBudget.budget` and say why. Prefer splitting instead — a
library that does not have to be there at startup belongs behind an `import()`.
