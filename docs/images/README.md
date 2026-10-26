# Handbook Images

Shared visual assets for the English handbook, the README, and the published website. Screenshots are captured from the running application, never drawn or mocked.

## Directory Layout

```
docs/images/
  en/            screenshots with English UI, one folder per chapter topic
  notation/      notation crops without UI text
```

Language-specific directories such as `de/` or `pt/` are added only when a translation exists. Images that carry no UI text stay in `notation/` and are shared by all languages.

Chapter folders used by `en/`: `getting-started/`, `library/`, `presentation/`, `staff-editing/`, `grid-editing/`, `playback/`, `print/`, `settings/`, `administration/`, `troubleshooting/`.

A folder is created when its first image is added. The planned images, their capture context, and their target paths are recorded in [`docs/planning/handbook-2.0/screenshot-storyboard.md`](../planning/handbook-2.0/screenshot-storyboard.md).

## File Naming

- Screenshots: `<topic>-<subject>.png`, for example `presentation/zen-mode.png`
- Instrument crops: `<instrument>.png`, for example `notation/repinique.png`
- No dates, version numbers, or author names in file names, so a re-capture replaces the file in place rather than
  leaving stale variants

## Capture Conventions

| Aspect         | Convention                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Browser        | Chromium, the version used by the Playwright suite                                             |
| Desktop size   | 1440 × 900 CSS px at device scale factor 2                                                     |
| Tablet / phone | 1024 × 768 and 390 × 844                                                                       |
| Theme and font | `Light+` and `Bravura`, unless the image demonstrates themes or music fonts                    |
| View state     | Playback stopped, no selection, no open menus, dismissed notifications                         |
| Score content  | The demo scores `Ijexá` and `Beija Flor 2004 - Bossa 2 ("I-Break")`                            |
| Personal data  | No real member names, e-mail addresses, or private scores                                      |
| Optimization   | PNG, optimized with `oxipng` or `pngquant`; full-window images below 300 kB, crops below 80 kB |
| Alt text       | Describes the visible content, never "screenshot of …"                                         |

## Usage in Markdown

Links are relative and must resolve on GitHub and in any static-site build:

- From a chapter page (`docs/en/<section>/<page>.md`): `../../images/en/<topic>/<name>.png`
- From a root page (`docs/en/instruments.md`, `docs/en/index.md`): `../images/notation/<name>.png`

Absolute repository URLs (`https://github.com/.../blob/...`) are not used, because they break forks, offline copies, and static-site rendering.

## Lifecycle

An image is added together with the text that uses it, in the same change. When a UI element changes, the image is re-captured from the same score, theme, font, and viewport, and the file name stays the same. Temporary capture artifacts are deleted once the final image is selected.
