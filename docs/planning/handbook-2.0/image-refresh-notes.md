# Image Refresh Notes

- Status: open decision, recorded 2026-10-29
- Scope: which captures have to be redone when the application version changes
- Belongs to: Phase 6 of issue #62, validating the release candidate

## Where the version shows up

`package.json` holds the version, `vite.config.ts` passes it to the application as `appVersion`, and the footer shows
it in two places: `v<version>` on the release-notes button and `Version <version>` in the compact footer menu. The
release-notes dialog repeats it in the heading of its newest entry.

Text places are found with a grep for the previous version number across `readme.md`, `docs/` and `release-notes.md`.
Images are not: the version is baked into their pixels, and no link or asset check sees it. The table below is kept by
hand until the decision at the end of this page is made.

## Captures that carry the version

Every capture whose frame shows the footer, plus the two that show the version itself:

| ID | File | Why |
| --- | --- | --- |
| S-01 | `en/presentation/staff-view.png` | Full window, footer in frame |
| S-02 | `en/presentation/grid-view.png` | Full window, footer in frame |
| S-03 | `en/presentation/zen-mode.png` | Zen mode keeps the footer |
| S-20 | `en/staff-editing/edit-mode.png` | Full window, footer in frame |
| S-41 | `en/presentation/footer.png` | The footer itself, shows `v<version>` |
| S-49 | `en/presentation/tablet-grid.png` | Tablet, footer in frame |
| S-53 | `en/presentation/release-notes.png` | Dialog with the newest version heading |
| S-58 | `en/presentation/tablet-zen-mode.png` | README hero, footer in frame |
| S-59 | `en/presentation/tablet-zen-grid.png` | Website hero, footer in frame |

Unaffected: the notation crops, the theme and music-font montages, the print preview, and S-47 on the phone, whose
footer folds the version into a menu.

## Open decision

1. **Checklist.** Add the version number to the retake triggers of the [storyboard](screenshot-storyboard.md), keep the
   table above there, and extend the release checklist in
   [documentation.md](../../en/development/documentation.md) with a step that re-captures these images and greps the
   documentation for the previous version.
2. **Capture script.** A versioned script, for example `build/capture-docs.ts`, that regenerates the footer captures
   from a running backend: login, score fixture, viewport, view, zoom, and the frame composition used for S-58 and
   S-59. Sturdier than a list, but it has to reproduce the capture context the storyboard records.

Neither variant is implemented yet; this page exists so the decision and the affected files are not lost.
