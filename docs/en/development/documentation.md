# Maintaining This Documentation

The handbook is edited in this repository and nowhere else. This chapter describes where a page belongs, how it is written, and what has to change when the application changes.

## Where the Handbook Lives

`docs/en/` is the authoritative edition:

| Directory                                              | Content                                               |
| ------------------------------------------------------ | ----------------------------------------------------- |
| `docs/en/index.md`                                     | Contents page; its tables define the reading order    |
| `docs/en/getting-started/`                             | What the application is and a first session           |
| `docs/en/using/`                                       | Library, presentation, editing, playback, printing    |
| `docs/en/administration/`                              | Installation, configuration, users, security, backups |
| `docs/en/reference/`                                   | Keyboard shortcuts and glossary                       |
| `docs/en/development/`                                 | This chapter and its neighbours                       |
| `docs/en/instruments.md`, `docs/en/troubleshooting.md` | Single pages with a fixed heading structure           |
| `docs/images/`                                         | Screenshots and notation crops                        |
| `docs/adr/`, `docs/design/`                            | Architecture decisions and design contracts           |

Sibling directories such as `docs/de/` or `docs/pt/` are reserved for translations and are created only when a translation exists.

## Page Conventions

- One H1 per page, taken from the page's title in `docs/en/index.md`.
- Heading levels start at H2 inside the page body; the instrument sections in `docs/en/instruments.md` keep their fixed names because other pages and the website link to them.
- Links are relative and never start with a slash; images are referenced the same way. Absolute repository URLs break forks and static-site builds.
- Terms follow the UI: **Score Library**, `score`, `track`, `bar`, `grid view`, `staff view`, `Zen mode`, `note style`. The [Glossary](../reference/glossary.md) defines all of them, and the instrument names stay as a bateria uses them.
- UI labels appear in backticks exactly as the application spells them, for example `Save Score` or `Group Access`.
- English only. The interface strings stay English as well, so a German or Portuguese term in a page is a mistake until translations exist.

## Images

[Image conventions](../../images/README.md) holds the directory layout, file naming, capture settings, size limits, and alt-text rules. In short:

- `docs/images/en/<topic>/` for screenshots with the English interface, `docs/images/notation/` for notation crops without interface text.
- File names carry no dates or versions, so a re-capture replaces the file.
- An image is added together with the text that uses it, and re-captured when the interface it shows changes.

## The Published Website

A separate project publishes the handbook; this repository stays the single source. The requirements for consuming a version — pinned tag or commit, navigation from `docs/en/index.md`, language selection, search scope, base paths, and link validation — are recorded in `docs/planning/handbook-2.0/website-handoff.md`, which is not published itself.

Two rules follow from that split:

- Corrections go into this repository, never into a copy in the website project.
- The website consumes a released version, so documentation changes reach it with the next release, not in between.

## Updating the Documentation for a Release

1. Walk the changed features against the affected chapters; the coverage checklist in `docs/planning/handbook-2.0/` names a destination for every feature.
2. Update the affected pages and re-capture the screenshots that show changed interface parts.
3. Check the [known limitations](../troubleshooting.md) table: removed limitations leave the table, new ones enter it.
4. Link new decision records from [Architecture and Decisions](architecture.md) when a change introduced one.
5. Write the release notes in `release-notes.md`, separate from the handbook.
6. Verify the links and image references of `docs/en/` before tagging the release.
7. Hand the release tag to the website project.

## Related Chapters

- [Architecture and Decisions](architecture.md) explains the codebase the documentation describes.
- [Glossary](../reference/glossary.md) holds the terminology this chapter refers to.
- [Installing Animada Score Book](../administration/installation.md) shows how the handbook reaches an installation.
