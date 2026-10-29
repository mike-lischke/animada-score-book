# Animada Score Book 2.0 — Handbook Handoff to the Website Project

- Status: Phase 2 deliverable for issue #62
- Scope: what the separate website project consumes from this repository, and which guarantee it can rely on
- Out of scope: VitePress configuration, hosting, deployment workflows, and publication. None of that is implemented
  in this repository.

## Source of Truth

The documentation is edited only in this repository. The website project consumes a fixed version of it and must not keep an editorial second copy; corrections go back into this repository.

| Content                     | Path                            | Notes                                                              |
| --------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| Handbook entry page         | `docs/en/index.md`              | Contents page; also the definition of the reading order            |
| Handbook chapters           | `docs/en/**/*.md`               | 20 chapter pages in five sections plus three root pages            |
| Screenshots and notation    | `docs/images/`                  | See [`docs/images/README.md`](../images/README.md)                 |
| Architecture decisions      | `docs/adr/`                     | Linked from developer chapters, never copied into the handbook     |
| Design contracts            | `docs/design/`                  | Linked from the developer chapter only                             |
| Not part of the publication | `docs/planning/`                | Phase artifacts for issue #62                                      |
| Product overview            | `readme.md`, `release-notes.md` | The website links to them; it does not re-host their text as pages |

Structure of the handbook:

```
docs/en/
  index.md
  instruments.md
  troubleshooting.md
  getting-started/   overview.md, first-steps.md
  using/             score-library.md, presentation.md, staff-editing.md, grid-editing.md, playback.md,
                     printing-and-export.md
  administration/    installation.md, configuration.md, users-groups-permissions.md, security.md,
                     backup-restore-upgrades.md
  reference/         keyboard-shortcuts.md, glossary.md
  development/       setup.md, architecture.md, documentation.md
```

## Versioned Consumption

- The website consumes a released version, identified by the git tag `v2.0.0` (or its commit SHA), never the moving
  `main` branch.
- The consumed version is displayed on the site, so a reader can tell which application release the text describes.
- A new handbook version is taken over only after the matching application release is tagged. The update procedure is
  described for maintainers in `docs/en/development/documentation.md`.
- Content changes that only affect wording may be taken over between releases, but always by moving to a newer tag or
  SHA, never by editing files inside the website project.

## Navigation

- The reading order is the order of the tables in `docs/en/index.md`. The site sidebar mirrors it; it is not
  maintained separately.
- Page titles come from the single H1 of each page. The pages carry no front matter, so no title or order metadata is
  available or required.
- Chapter URLs should follow the file paths (`using/playback`, `administration/security`, and so on). The instrument
  sections in `docs/en/instruments.md` keep fixed heading names — Agogô 2-Bell, Agogô 4-Bell, Chocalho, Tamborim,
  Repinique, Repinique (Whippy Sticks), Caixa, Timbau, Surdo Terceira, Surdo Segunda, Surdo Primeira — because other
  pages, the README, and possibly the site link to them individually.
- The site provides previous/next navigation derived from the same order.

## Language Selection

- `docs/en/` is the authoritative edition. `docs/de/` and `docs/pt/` are reserved and do not exist yet.
- The English content maps to the site root; additional languages are added as locale directories with the identical
  file names, so links stay language-relative and a missing translation can fall back to English.
- The site offers a language switch only when at least one translated handbook exists.

## Search

- The site builds its search index from `docs/en/` at build time; no external search service is required.
- `docs/planning/`, `docs/adr/`, and `docs/design/` are excluded from the search index even if they are rendered.
- Search results lead to the same paths as the navigation, so deep links and anchors remain stable.

## Base Paths

- All links and image references in the handbook are relative, without a leading slash. This keeps them working on
  GitHub, in a repository checkout, and under any site base path (domain root or a subdirectory).
- The site may be published under a configurable base path; no handbook page assumes `/` as its root.
- Links that leave the handbook are limited to the repository documents listed in "Source of Truth" and to files
  inside `docs/`. No link points at absolute `github.com` URLs for repository content.

## Link and Asset Validation

Before a handbook version is taken over, and as part of the site build, the following must hold:

1. Every relative Markdown link resolves to an existing file.
2. Every anchor used in a link matches a heading in the target page.
3. Every referenced image exists under `docs/images/` and stays below the agreed size limits.
4. No link uses an absolute repository URL in place of a relative path.
5. Links into `docs/adr/`, `docs/design/`, and `docs/images/README.md` either render on the site or are rewritten to
   the repository. These pages are outside `docs/en/` but are linked from developer chapters, so the site must handle
   them deliberately.
6. Images have alternative text that describes the visible content.

## Publishing Constraints

- The handbook must not be published from an untagged working state.
- Screenshots must not contain personal data; the storyboard's capture conventions apply.
- Roadmap items, unimplemented design drafts, and internal limitations marked as non-user-facing must not appear on
  the site.

## Open Decisions (Owner: Website Project)

| Decision                                      | Needed by         |
| --------------------------------------------- | ----------------- |
| Documentation URL path and base configuration | first site draft  |
| Whether GitHub Pages is enabled in addition   | first publication |
| Rendering or rewrite strategy for ADR links   | first site draft  |
| Search implementation                         | first site draft  |

## Definition of Done for the Handoff

- The site project points at a documented tag or SHA of this repository.
- Every chapter from `docs/en/index.md` is reachable through the site navigation.
- Pages, anchors, and images resolve under the configured base path.
- The site displays the handbook version it was built from.
