# Animada Score Book 2.0 — Handbook Table of Contents

- Status: Phase 1 draft for maintainer review (issue #62)
- Scope: the English handbook under `docs/en/`, its page structure, audiences and link conventions
- Out of scope: VitePress configuration, website hosting and the separate website project

## Principles

- One authoritative Markdown source per topic. The GitHub README links into these pages; the website project consumes
  the same files at a tagged version.
- English only. `docs/de/` and `docs/pt/` stay reserved for later translations and are not created now.
- Pages are written for readers, not for contributors. Architecture statements stay in `docs/adr/` and `docs/design/`
  and are linked, never copied.
- Screenshots show the running application. Image paths are relative and resolve on GitHub and in VitePress.
- Documentation describes the released feature set. Roadmap items, unimplemented drafts and dead components are not
  documented.

## Page Structure

| #   | File                                                 | Title                                                    | Audience       | Purpose and key content                                                                                                                                                                                                   |
| --- | ---------------------------------------------------- | -------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `docs/en/index.md`                                   | Animada Score Book Handbook                              | all            | Handbook contents page. Three entry points (musicians, administrators, developers), one-line summary per chapter, links to README, release notes and the published site once it exists.                                   |
| 2   | `docs/en/getting-started/overview.md`                | What Animada Score Book Is                               | musicians      | Product idea, concepts used throughout (score, track, bar, instrument, note style), backend + browser frontend, browser and device requirements, demo access and what it can and cannot do.                               |
| 3   | `docs/en/getting-started/first-steps.md`             | Your First Session                                       | musicians      | Reach the app, sign in / continue anonymously / group login, open a score, play and stop, switch grid and staff view, zoom, enter Zen mode, save, where settings are.                                                     |
| 4   | `docs/en/using/score-library.md`                     | The Score Library                                        | musicians      | Open the library, browse the tree, create folders, create and import scores, open, rename and remove entries, copy a share URL, permission indicators, who may change what.                                               |
| 5   | `docs/en/using/presentation.md`                      | Reading a Score: Grid View, Staff View, Fonts and Themes | musicians      | The two views and when to use which, music fonts and what they change, color themes, zoom, score navigator, Zen mode, mobile and tablet behaviour, notification center.                                                   |
| 6   | `docs/en/using/staff-editing.md`                     | Editing in the Staff View                                | musicians      | Entering and removing notes, note values and dots, rests, note styles and techniques, articulations, subdivisions and tuplets, insert vs overwrite, selection, clipboard, bar and track actions, dynamics, undo and redo. |
| 7   | `docs/en/using/grid-editing.md`                      | Editing in the Grid View                                 | musicians      | The raster model, note entry and removal, note styles via toolbar and radial menu, selections, repeated-step limitations, what the grid cannot do, cross-view workflow.                                                   |
| 8   | `docs/en/using/playback.md`                          | Playback and Practice                                    | musicians      | Transport, tempo, master volume, per-track mixer and focus boost, metronome and count-in, Play Focus, loop, repeat playback order, playhead and auto-scroll, click-to-preview notes.                                      |
| 9   | `docs/en/using/printing-and-export.md`               | Printing, PDF and MP3 Export                             | musicians      | Print preview controls, measure widths, page setup guidance, browser print settings, PDF result, MP3 export and its settings and limits.                                                                                  |
| 10  | `docs/en/instruments.md`                             | Instrument and Notation Reference                        | musicians      | **One page, one section per instrument type** (see below). Explains heads, technique marks, articulations and which samples exist.                                                                                        |
| 11  | `docs/en/administration/installation.md`             | Installing Animada Score Book                            | administrators | Requirements, deployment package, directory layout, database preparation, first start, first-run installation wizard, reverse proxy and HTTPS, upgrade path.                                                              |
| 12  | `docs/en/administration/configuration.md`            | Configuring the Backend                                  | administrators | Every `backend-config.json` key and environment variable with default and effect, `JWT_SECRET`, sound library path, port and host, CORS, proxy trust, static serving, branch databases in development.                    |
| 13  | `docs/en/administration/users-groups-permissions.md` | Users, Groups and Permissions                            | administrators | First admin, user and group management, group passwords and group login, `Admins` and `World`, owner, read/write inheritance, `Group Access` editor, resetting children, database reset.                                  |
| 14  | `docs/en/administration/security.md`                 | Security Notes                                           | administrators | Password hashing, token lifetimes, refresh cookie and the HTTPS requirement, brute-force limiting, score locks, what the server does not do (no CSP, no audit viewer), hardening checklist.                               |
| 15  | `docs/en/administration/backup-restore-upgrades.md`  | Backup, Restore and Upgrades                             | administrators | What lives in the database versus the browser, backup procedure per engine, restore test, migration behaviour on startup, checksum mismatch, upgrades between releases, database reset as last resort.                    |
| 16  | `docs/en/troubleshooting.md`                         | Troubleshooting and Known Limitations                    | all            | Server unreachable, connection lost, setup blocked, login failures and lockout, permission errors, locked scores, missing sounds or fonts, export problems, print differences, documented limitations.                    |
| 17  | `docs/en/reference/keyboard-shortcuts.md`            | Keyboard Shortcuts                                       | musicians      | Global shortcuts, score input keys per view, selection modifiers, dialog and menu keys.                                                                                                                                   |
| 18  | `docs/en/reference/glossary.md`                      | Glossary                                                 | all            | The agreed terminology (see `terminology` section in `audit.md`), music terms used in the handbook, UI terms with their German/Portuguese equivalents where they occur in Samba practice.                                 |
| 19  | `docs/en/development/setup.md`                       | Development Setup                                        | developers     | Requirements, `backend-config.json`, `npm run dev` (HTTPS note), backend start, test commands, database migrations and branch databases, VS Code debugging.                                                               |
| 20  | `docs/en/development/architecture.md`                | Architecture and Decisions                               | developers     | Short map of the codebase with links to `docs/adr/`, `docs/design/app-layout-contract.md`, `docs/design/build-output-contract.md` and the test layout. No duplicated architecture prose.                                  |
| 21  | `docs/en/development/documentation.md`               | Maintaining This Documentation                           | developers     | Page and image conventions, handbook/website handoff, screenshot update procedure, what must change with each release.                                                                                                    |

## Instrument Reference Sections

`docs/en/instruments.md` is a single page. It opens with notation basics that apply to every instrument (percussion
clef, per-instrument staff lines, note values and rests as prerequisites, how playing techniques are drawn, how
articulations and dynamics look), then one section per instrument type:

| Section | Instrument                | Note styles | Special drawing                               |
| ------- | ------------------------- | ----------- | --------------------------------------------- |
| 1       | Agogô 2-Bell              | 2           | Two staff lines, low/high bell                |
| 2       | Agogô 4-Bell              | 4           | Four staff lines, four bells                  |
| 3       | Chocalho                  | 2           | One line, triangle head, ghost parenthesis    |
| 4       | Tamborim                  | 2           | One line, cross head, accent and ghost        |
| 5       | Repinique                 | 7           | One line, stick and hand techniques, rim shot |
| 6       | Repinique (Whippy Sticks) | 2           | One line, accent and ghost                    |
| 7       | Caixa                     | 4           | One line, press roll, rim shot                |
| 8       | Timbau                    | 3           | One line, square head, open/slap/bass         |
| 9       | Surdo Terceira            | 2           | One line, open/muted, damped plus sign        |
| 10      | Surdo Segunda             | 2           | Same as Surdo Terceira                        |
| 11      | Surdo Primeira            | 2           | Same as Surdo Terceira                        |

Each section uses the same internal order: what the instrument is, how it sits on the staff, a table of note styles
(name, marker, meaning, sample), the articulations the track offers, playback notes, and a cross-reference to the
editing instructions that create these marks.

## Reserved Sibling Directories

```
docs/
  en/            English handbook (structure established in Phase 2)
  de/            reserved, not created
  pt/            reserved, not created
  images/        shared visual assets, see images/README.md
    en/          screenshots with English UI (created with the first image)
    notation/    notation crops without UI text (created with the first image)
  adr/           architecture decisions (unchanged)
  design/        design contracts (unchanged)
  planning/      phase artifacts for issue #62 (not published)
```

## Link Conventions

- Cross-page links use relative paths without a leading slash: `../using/playback.md`, `administration/security.md`.
- Links from `docs/en/*/` to ADRs use `../../adr/NNNN-....md`; from `docs/en/` root pages `../adr/...`.
- Images use `../../images/en/<topic>/<name>.png` from chapter pages and `../images/en/<topic>/<name>.png` from
  `docs/en/` root pages.
- Anchors use the heading text in lower case with hyphens; every instrument section name must stay stable because
  the README and website link to individual sections.
- No absolute GitHub URLs for repository content; they break in VitePress and in forks.

## README Link Targets (Phase 5)

The README links to `docs/en/index.md`, to the four priority chapters (staff view, instruments, Zen mode/presentation,
Score Library) and to the release notes. It does not repeat installation steps beyond a short pointer to
`docs/en/administration/installation.md`.
