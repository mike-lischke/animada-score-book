# Animada Score Book 2.0 — Documentation Audit, Terminology and Scope Decisions

- Status: Phase 1 draft for maintainer review (issue #62)
- Companion documents: [`table-of-contents.md`](table-of-contents.md),
  [`coverage-checklist.md`](coverage-checklist.md), [`screenshot-storyboard.md`](screenshot-storyboard.md)

## 1. Terminology

The handbook uses the labels the application shows. Where code or earlier documents use a different word, the handbook uses the user-facing word and the glossary notes the difference.

| Concept                             | Term used in the handbook                               | UI evidence                                                                  | Avoid                                                                             |
| ----------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| The browsable score collection      | **Score Library**, its structure the **library tree**   | Drawer title and panel label `Score Library`, breadcrumb `Score Library › …` | `Score Tree` (issue wording, absent from the UI), `library drawer`, `folder view` |
| One piece of music                  | **score**                                               | `Score`, `Save Score`, `Copy Score URL`, dialog `New Song`                   | `song` in prose, `arrangement` in user pages                                      |
| The internal data model             | arrangement                                             | Code and ADRs only                                                           | Using it in user pages                                                            |
| A row of the score                  | **track**                                               | `Track actions`, `Add Tracks`                                                | `voice`; a track *uses* an instrument, it is not one                              |
| A column of the score               | **bar**                                                 | `Number of bars`, `Insert Bars`, `Clear bar`, `Delete bar`, `bar N`          | `measure` in user pages (code and ADRs use measure)                               |
| Matrix presentation                 | **grid view**                                           | Switch label `Grid`, tooltip `Show the score as a note grid (G)`             | `matrix view`, `grid mode`                                                        |
| Notation presentation               | **staff view**                                          | Switch label `Staff`, tooltip `Show the score as staff notation (S)`         | `notation view` (README), `staff mode`                                            |
| Distraction-free view               | **Zen mode**                                            | `Enter Zen mode` / `Exit Zen mode`                                           | `fullscreen`, `presentation mode`                                                 |
| Editing state                       | **edit mode**                                           | `Edit Mode` / `Editing`                                                      | `editor mode`                                                                     |
| A playable variant of an instrument | **note style**                                          | Heading `Note style & technique`, style names `Center`, `Ghost`, `Slap`      | `sound style`, `sample variant`                                                   |
| How the instrument is struck        | **playing technique**                                   | Technique tooltips and marks                                                 | Using it synonymously with articulation                                           |
| Added marking on a note             | **articulation**                                        | `Accent`, `Damped`, `Ghost`                                                  | `dynamic`                                                                         |
| Volume markings in the score        | **dynamics**                                            | `Crescendo`, `Decrescendo`, `Forte`                                          | `range articulation`                                                              |
| A tuplet inside a bar               | **subdivision** (app object), **tuplet** (music theory) | `Add subdivision`, `Triplet`, `Paste Subdivision`                            | `polyrhythm` (reserved for BananaDrum imports)                                    |
| A repeat sign for a whole bar       | **one-bar repeat (simile)**                             | `One-bar repeat (simile)`                                                    | `simile sign` alone                                                               |
| The chosen playback range           | **Play Focus**                                          | `Play Focus` per bar control                                                 | `play range` in headings, use it once as explanation                              |
| The per-track volume column         | **mixer**                                               | `Expand mixer` / `Collapse mixer`, legend `◀︎ Mute` / `Focus ▶︎`               | `instrument sidebar` (design document wording)                                    |
| A boosted track                     | **focus**                                               | `Focus ▶︎`                                                                    | `solo` (focus attenuates the others but is not exclusive)                         |
| Per-track silence                   | **mute**                                                | `◀︎ Mute` at volume 0                                                         | Using "mute" for the focus feature                                                |
| Settings surface                    | **Settings**                                            | Tooltip `Settings`, dialog header `Settings`                                 | Calling the dialog `Display Options`                                              |
| Notation font                       | **music font**                                          | `Music font`                                                                 | `notation font`                                                                   |
| UI colours                          | **color theme**                                         | `Color theme`, `Auto`                                                        | `skin`, `theme mode`                                                              |
| Footer navigation strip             | **score navigator**                                     | Caption `Bar 5 of 32`                                                        | `minimap`                                                                         |
| Message history                     | **notification center**                                 | Bell button, history panel                                                   | `toasts` for the whole feature                                                    |
| Per-entry permissions               | **Group Access**                                        | Menu item `Group Access`                                                     | `permissions dialog`                                                              |
| Permission levels                   | **read** and **write**                                  | Editor columns `Read`, `Write`                                               | `view`/`edit` permissions                                                         |
| System groups                       | **Admins** and **World**                                | Group names as shown                                                         | `administrators group`                                                            |
| Server process                      | **backend**, storage **database**                       | Log `Backend server listening on …`                                          | `server` for both                                                                 |
| Planned demo entry                  | **demo access**                                         | Not implemented yet                                                          | `guest mode`                                                                      |
| Release artifact                    | **deployment package**                                  | New `npm run package`                                                        | `bundle` (that is the JavaScript build)                                           |

Capitalisation rules: UI labels keep their exact case (`Settings`, `Play Focus`, `Group Access`, `Users & Groups`, `Score Library`). Descriptive terms are lower case in running text (`grid view`, `staff view`, `edit mode`, `Zen mode`, `one-bar repeat`). Headings may capitalise the first word only, except for UI labels.

### 1.1 UI wording inconsistencies

The application was inconsistent in three places. The first two were approved and applied on 2026-10-26; the remaining occurrences await a decision.

| Inconsistency                       | Instances                                                                                                       | State                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| "bar" versus "measure"              | `Number of bars`, `Insert Bars`, `Clear bar`, `Delete bar`, `bar N` versus the footer caption `Measure 5 of 32` | **Applied:** the footer captions now read `Bar 5 of 32` / `Bars 5 – 9 of 32` in `AppFooter.tsx`         |
| `Display Options` versus `Settings` | Gear tooltip and overflow item said `Display Options`; the dialog header says `Settings`                        | **Applied:** tooltip, overflow item and tutorial texts now say `Settings` (tutorial removed, issue #63) |
| `Edit Mode` versus `Editing`        | The switch shows `Edit Mode` outside and `Editing` inside edit mode                                             | Keep both (they describe state changes) and document the pair                                           |

Remaining "measure" labels outside the footer awaited approval: the print-preview overflow warning (`Measure 3`) and the selection toolbar caption (`Measure 5`). Both were changed to `Bar`/`Bars` on 2026-10-26 as well. The tutorial, which also had an outdated print step, is disabled for 2.0.0; its rework is tracked in issue #63.

Until these are changed, the handbook uses "bar" in prose and quotes a remaining UI label only where the described screenshot shows it.

## 2. Documentation Audit

### 2.1 Verified state of the existing documentation

| Document                                    | Assessment                                                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `readme.md`                                 | Correct in structure and mostly in content, but has stale version, command, URL and zoom claims — see 2.2 |
| `release-notes.md`                          | Current through 1.5.0; no 2.0.0 section yet (Phase 6)                                                     |
| `docs/adr/readme.md` + 20 ADRs              | Current and accurate; linked, never copied into the handbook                                              |
| `docs/design/build-output-contract.md`      | Current (matches `vite.config.ts`, `BundleBudget`, lazy-loading rules)                                    |
| `docs/design/app-layout-contract.md`        | Accepted working template for issue #52; contains surfaces and wording that are not all implemented       |
| `docs/design/score-navigation.md`           | Explicitly a design draft that is not implemented — must not appear in the handbook                       |
| `.github/copilot-instructions.md`           | Internal contributor guidance; describes a schema mechanism that no longer exists — see 2.3               |
| `docs/grid-view.png`, `docs/staff-view.png` | Captured 2026-07-05, before 1.3.0/1.4.0/1.5.0; outdated notation, no header or footer                     |

### 2.2 Stale or incorrect statements in `readme.md`

| Line     | Statement                                                                                                                                                                                          | Reality                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 65, 152  | "Node.js version 20 or later", "Node.js 20+"                                                                                                                                                       | `package.json` requires `^24.15.0 \|\| ^26.0.0`; `.nvmrc` is `26`; CI runs 24.x and 26.x                          |
| 157      | `npm run start-with-dummy-secret`                                                                                                                                                                  | The script does not exist; the development start is `npm run start-debug` (`JWT_SECRET="for-debugging"`)          |
| 168      | "opens the app at `http://localhost:5173`"                                                                                                                                                         | `vite.config.ts` serves HTTPS with `~/.ssh/localhost-key.pem` and `localhost-cert.pem` → `https://localhost:5173` |
| 132      | Expected log `Server running on http://0.0.0.0:3100`                                                                                                                                               | Actual log: `Backend server listening on http://127.0.0.1:3100 (bound to 0.0.0.0:3100)`                           |
| 23       | "automatic and manual zoom"                                                                                                                                                                        | Zoom is manual only (50–150 %, step 10). `Fit width`/`Fit page` exist only in the print preview                   |
| 74–77    | "Download the latest release and unzip it"                                                                                                                                                         | No release contains a build artifact; only GitHub's source archives exist (section 3)                             |
| Features | Feature list omits Zen mode, Play Focus, notification center, settings, users/groups, group login, dynamics, tuplets, insert/overwrite, simile, measure widths, seven music fonts, thirteen themes | Covered by the coverage checklist and the README refresh in Phase 5                                               |
| 98–107   | `backend-config.json` example lists four config groups                                                                                                                                             | Missing `allowedOrigins` and `trustProxy`; environment variables are not mentioned at all                         |

Correct and reused as-is: system requirements (MySQL/MariaDB/PostgreSQL), `JWT_SECRET` explanation, `npm run start` and `npm run build` split, migration runner and `@mysql`/`@postgres` markers, branch-specific databases, `npm run db:cleanup`, print-output guidance, development command table, technology summary.

### 2.3 Internal documents to correct while working on the release

- `.github/copilot-instructions.md` still calls `createTablesSQL` in `src/server/mysql-adapter.ts` the canonical schema
  and lists `users` column drift. The array no longer exists; the schema lives in `migrations/` and the baseline
  migration already contains `refresh_token_hash`, `auth_type` and `group_id`.
- `docs/design/app-layout-contract.md` names surfaces that do not exist as described (`recording export`,
  `track/measure selectors`, `Instrument sidebar`). It stays a developer document; the handbook links to it only from
  the development chapter, with a note that it is a design contract, not a user description.
- `docs/design/score-navigation.md` keeps its `Status: draft (design proposal, not implemented yet)` line. The
  handbook does not mention tags, favourites or virtual folders.

## 3. Deployment Package and Release Artifacts

### 3.1 Verified current state

| Check                      | Result                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Git tags                   | `v1.0.0` … `v1.5.0`, `package.json` version `1.5.0`                                                                                        |
| GitHub releases            | `v1.3.0`, `v1.4.0`, `Animada Score Book 1.5.0` (latest)                                                                                    |
| Release assets             | None. `gh release view v1.5.0 --json assets` returns `[]`; only GitHub's automatic source archives exist                                   |
| Packaging script           | None in `package.json`; no `zip`/`tar`/`archive` tooling                                                                                   |
| Release automation         | None. Workflows are `nodejs.yml`, `nodejs-windows.yml`, `playwright.yml` (build and test only)                                             |
| Build output               | `npm run build` generates SMuFL metrics, verifies fonts, generates themes, runs `vite build` into `dist/`, then enforces the bundle budget |
| Production start           | `npm run start` runs `tsx src/server/backend.ts`; `tsx` is a **devDependency**                                                             |
| Server-side static serving | The backend serves `public/` and `dist/` itself, with `dist/index.html` as SPA fallback                                                    |
| Committed configuration    | `backend-config.json` is git-ignored and untracked; no example file is shipped                                                             |

Consequence: the issue's premise of an "existing deployment package distributed through GitHub Releases" does not match the repository. Previous releases shipped source only.

### 3.2 Agreed direction (maintainer decision, Phase 1)

Introduce a deployment package script for 2.0.0. It produces a versioned archive that an operator can unpack and run without a development checkout.

Contents derived from the code:

| Path                                                             | Reason                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------------- |
| `dist/`                                                          | Built frontend, including generated theme CSS            |
| `public/`                                                        | Fonts with metrics, sounds, logo, static assets          |
| `src/server/`, `src/core/` and their transitive imports          | `npm run start` executes TypeScript sources directly     |
| `build/migration.ts`, `build/seed.sql`                           | Imported by `src/server/backend.ts` at startup           |
| `migrations/*.sql`                                               | Schema and migrations                                    |
| `package.json`, `package-lock.json`                              | Dependency installation                                  |
| `tsx` (moved to `dependencies` or server compiled to JavaScript) | Required by the production start command                 |
| `backend-config.example.json`                                    | Template, because the real file is ignored and untracked |
| `docs/en/`, `release-notes.md`, `readme.md`, `License.txt`       | Offline handbook and licence information                 |

Open points for Phase 6: archive format (tar.gz only or tar.gz plus zip), whether to ship `node_modules` or require `npm ci --omit=dev`, and whether the package should include the handbook or link to the published site. `npm ci --omit=dev` currently breaks the production start because of the `tsx` devDependency — this must be resolved by the packaging decision, not by documentation wording.

## 4. Known Limitations

Severity: **document** = listed in the handbook; **internal** = tracked, not user-facing. Maintainer decision (2026-10-26): no limitation blocks the release; every entry below is documented instead of fixed in 2.0.0. The packaging work in section 3 stays a release task, not a limitation.

### Product

| ID   | Limitation                                                                                                    | Severity |
| ---- | ------------------------------------------------------------------------------------------------------------- | -------- |
| L-01 | No automatic zoom, pinch or wheel zoom; zoom is manual 50–150 %                                               | document |
| L-02 | Dynamics can only be placed in the staff view in edit mode                                                    | document |
| L-03 | Instruments are defined in code; no instrument administration, no per-install sound library UI                | document |
| L-04 | No audit-log viewer; `login_audit` is written but never read                                                  | document |
| L-05 | No self-service password change, no device/session management                                                 | document |
| L-06 | No backup/restore tooling; `build/dump-seed.ts` covers folders and scores only                                | document |
| L-07 | No migration path between database engines                                                                    | document |
| L-08 | Scores are stored as one blob per save; no version history; concurrent saves are last-write-wins              | document |
| L-09 | Undo history and playback position are session-only; selection is restored from browser storage               | document |
| L-10 | No in-app PDF generation; PDF comes from the browser print dialog                                             | document |
| L-11 | MP3 export needs browser MP3 encoding support; loop is excluded and there is no range export                  | document |
| L-12 | A group login reuses the anonymous user row; a new group login invalidates earlier group refresh tokens       | document |
| L-13 | Score locks last 30 minutes, have no heartbeat and are only released on save or leaving edit mode             | document |
| L-14 | Anonymous visitors can browse all world-readable scores; demo restrictions are a separate task                | document |
| L-15 | No pagination or filtering in user and group lists                                                            | document |
| L-16 | The instrument image upload endpoint does not match the migrated `instrument_images` schema and has no caller | internal |
| L-17 | `Diamond` notehead, several hand and stick techniques, `Scraped`/`Blown` modes are modelled but unused        | internal |
| L-18 | Unused `features` table and `canManageInstruments`/`canExportMP3` capabilities                                | internal |

### Security and correctness

| ID   | Limitation                                                                                                                 | Severity |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| L-19 | The refresh cookie is `Secure`; without HTTPS the browser drops it, so sessions silently lose refresh after 15 minutes     | document |
| L-20 | Refresh tokens have no server-side expiry check (only the cookie's 7-day `Max-Age`); logout does not clear the stored hash | document |
| L-21 | One refresh token slot per user row: a second login invalidates the first device                                           | document |
| L-22 | `updateScore` validates the lock only when the client sends a `token`; omitting it bypasses the lock                       | document |
| L-23 | The unauthenticated `health` action returns engine, host, port and database name                                           | document |
| L-24 | `setup` with `overwrite` and `testConnection` are callable without a session while no users exist or `hasUsers()` fails    | document |
| L-25 | No CSRF tokens, no CSP, HSTS, `X-Frame-Options` or `Referrer-Policy`; only `X-Content-Type-Options: nosniff`               | document |
| L-26 | Brute-force limiting is in-memory per process, applies only to `login`/`groupLogin` and resets on restart                  | document |

### Operations

| ID   | Limitation                                                                                         | Severity |
| ---- | -------------------------------------------------------------------------------------------------- | -------- |
| L-27 | Production start depends on the `tsx` devDependency                                                | document |
| L-28 | No TLS in the Node process; a reverse proxy is required for HTTPS                                  | document |
| L-29 | A modified migration file requires dropping the whole database (no down migrations, no repair)     | document |
| L-30 | No access log, metrics or structured logging                                                       | internal |
| L-31 | Health state is not reported (`configLoaded` is always true; the fatal config branch is dead code) | internal |

### Release Blocker Decision (2026-10-26)

No defect blocks 2.0.0. The four candidates are handled as follows:

1. **Deployment package** (L-27): stays a release task — implement the packaging script in Phase 6 and use it for the
   GitHub release in Phase 7. The production start must not depend on an unshipped devDependency.
2. **HTTPS and the refresh cookie** (L-19): the installation chapter states HTTPS as mandatory, and the
   troubleshooting chapter explains that a plain-HTTP deployment loses the refresh session after 15 minutes.
3. **Lock enforcement on score update** (L-22): the handbook documents last-write-wins; it does not promise conflict
   protection. The existing lock warning stays described as a courtesy for open editors.
4. **Refresh token invalidation on logout** (L-20): the security chapter states that signing out does not revoke an
   already issued refresh token, and that rotating `JWT_SECRET` remains the operator's lever.

These items are fixed in a later release. Creating follow-up GitHub issues for them is recommended so they do not disappear once the handbook is published.

Everything else is documented as a known limitation. Nothing here is silently added to the 2.0.0 scope as a new feature.

## 5. Scope Decisions

### Taken in Phase 1

| Decision                               | Result                                                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library term                           | **Score Library**; "Score Tree" is not used                                                                                                                     |
| Instrument reference layout            | **One document** (`docs/en/instruments.md`) with one section per instrument type                                                                                |
| Instrument sections                    | 11 sections: Agogô 2-Bell, Agogô 4-Bell, Chocalho, Tamborim, Repinique, Repinique (Whippy Sticks), Caixa, Timbau, Surdo Terceira, Surdo Segunda, Surdo Primeira |
| Release artifact                       | Introduce a deployment package script; releases then carry a real archive                                                                                       |
| Demo material                          | Seeded: `build/seed.sql` holds the folder `Common Scores` with `Ijexá` and `Beija Flor 2004 - Bossa 2 ("I-Break")`                                              |
| Language                               | English only; `docs/de/` and `docs/pt/` stay reserved                                                                                                           |
| Onboarding tutorial                    | Disabled for 2.0.0; wizard, steps, setting, styles and tests removed; rework tracked in issue #63                                                               |
| Roadmap and demo-access implementation | Out of scope for the documentation work                                                                                                                         |
| Release blockers                       | None; all candidates are documented as limitations (2026-10-26)                                                                                                 |
| UI wording                             | Footer says `Bar`/`Bars`; `Display Options` renamed to `Settings`; print warning and selection caption use `Bar` (applied 2026-10-26)                           |
| Terminology and table of contents      | Confirmed by the maintainer (2026-10-26)                                                                                                                        |

### Still open

| Decision                                                     | Owner                    | Needed by |
| ------------------------------------------------------------ | ------------------------ | --------- |
| Archive format and whether to ship `node_modules`            | maintainer               | Phase 6   |
| Website URL path, source consumption mechanism, GitHub Pages | separate website project | Phase 2   |
| Leading screenshot fonts and themes beyond the proposed sets | maintainer               | Phase 4   |
| Final 2.0.0 release notes wording                            | maintainer review        | Phase 6   |

## 6. Phase 1 Exit Status

| Exit criterion                                            | State                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| Feature inventory against UI and implementation           | Done — `coverage-checklist.md`, 192 entries, code-derived       |
| Coverage checklist with destination and screenshot need   | Done — every row has a page and an image ID or an explicit dash |
| Consistent terminology matching the UI                    | Done — confirmed 2026-10-26; two UI labels aligned to the terms |
| Known limitations and release-blocking defects identified | Done — no blockers; all limitations documented                  |
| Existing documentation reviewed for stale content         | Done — section 2                                                |
| Deployment package and previous artifacts verified        | Done — section 3; premise corrected, direction agreed           |
| Final table of contents and screenshot storyboard         | Done — confirmed 2026-10-26                                     |

Phase 1 is complete. Phase 2 establishes the `docs/en/` structure using the confirmed table of contents.
