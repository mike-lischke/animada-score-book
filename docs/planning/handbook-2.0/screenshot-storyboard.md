# Animada Score Book 2.0 — Screenshot and Notation Storyboard

- Status: Phase 1 draft for maintainer review (issue #62)
- Scope: every image the handbook and the refreshed README need, with capture context so images can be reproduced
- Dependency: Ijexá and I-Break demo scores. Both are seeded in `build/seed.sql` under `Common Scores`, so the
  corresponding captures are unblocked
- Storage: `docs/images/en/` for screenshots with English UI, `docs/images/notation/` for notation crops without UI
  text. `docs/grid-view.png` and `docs/staff-view.png` are from before 1.3.0 and are replaced, not reused

## Capture Conventions

| Aspect         | Convention                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Browser        | Chromium, same version as the Playwright suite                                                                                      |
| Desktop size   | 1440 × 900 CSS px, device scale factor 2, exported at 1440 × 900                                                                    |
| Tablet size    | 1024 × 768                                                                                                                          |
| Phone size     | 390 × 844                                                                                                                           |
| Theme          | `Light+` unless the row says otherwise; dark captures use `Dark+`                                                                   |
| Music font     | `Bravura` unless the row shows font differences                                                                                     |
| Zoom           | 50 % for full-window score views (a bar is 1280 px wide at 100 %), 100 % for notation crops, print preview at its 40 % display zoom |
| Chrome         | Header and footer complete, no open menus, except where the row documents a menu, popup or dialog                                   |
| Notifications  | Dismissed, so no stale toasts appear in any image                                                                                   |
| Score content  | Ijexá for general views, I-Break where a second piece helps, a score with a single instrument for instrument crops                  |
| Personal data  | No real member names, e-mail addresses or private scores; check score titles and user menus before capture                          |
| File naming    | `<topic>-<subject>.png`; instrument crops `<instrument>.png`                                                                        |
| Optimization   | PNG, `oxipng`/`pngquant`; full-window images target < 300 kB, notation crops < 80 kB                                                |
| Alt text       | Describes the visible content ("Staff view of Ijexá with the note style bar open"), never "screenshot of …"                         |
| Record keeping | The capture context column is the record; re-capture from the same score, theme, font and viewport                                  |

## Capture Status

**P1 captured (2026-10-27).** The eight showcase images and the eleven instrument crops exist in `docs/images/`:

| ID      | File                              | Note                                                                 |
| ------- | --------------------------------- | -------------------------------------------------------------------- |
| S-01    | `en/presentation/staff-view.png`  | Ijexá, bars 5–7, playhead mid-score, 50 % zoom                       |
| S-02    | `en/presentation/grid-view.png`   | Same passage in the grid view                                        |
| S-03    | `en/presentation/zen-mode.png`    | Zen mode, instrument names only                                      |
| S-04    | `en/library/library-tree.png`     | Drawer with two open folders and the `World` indicators              |
| S-05    | `en/presentation/themes.png`      | `Light+`, `Dark+`, `Monokai Dimmed`, `Solarized Light`, one bar each |
| S-06    | `en/presentation/music-fonts.png` | `Bravura`, `Leipzig`, `Petaluma`, `Sebastian`, one bar each          |
| S-20    | `en/staff-editing/edit-mode.png`  | Edit mode with the note style popup open                             |
| S-43    | `en/print/print-preview.png`      | I-Break in portrait, two pages at 40 % display zoom                  |
| S-54a–k | `notation/<instrument>.png`       | One bar per instrument, each from its own single-instrument score    |

Deviations from the plan above, kept for the re-captures:

- Full-window images are captured at 2880 × 1800 (device scale factor 2) and exported at 1440 × 900.
- The staff lines of a system run from the clef into the first bar: the prefix's lines reach the note rows of the
  first bar, which keeps a side padding of `--staff-column-side-padding`. The gap at each barline stays, because the
  bar separator for the width adjustment sits there.
- The comparison montages show one bar per cell rather than two, because a two-bar cell has to be
  downscaled so far that the staff lines fade.
- The print preview is in portrait; in landscape a page holds a single system and looks half empty.
- The instrument score is created through `New Song` and filled with the number keys, then discarded; it never reaches
  the database.
- Each instrument crop comes from **its own** score with a single track. With all eleven instruments in one score the
  system shrinks so far that the notation is unreadable at 100 % zoom; the percussion clef itself renders correctly at
  every zoom level (checked at 100 % and 50 %: 2 × 2 staff spaces box, 2 spaces tall ink, nothing clipped).
- Crop framing for the notation images: left edge 20 px before the prefix column (so clef and time signature are
  complete), right edge 56 px after the last notehead, 84 px above the topmost and 56 px below the bottommost staff
  line. Playhead, entry cursor, bar number and track column are hidden.

## Documentation Example Score
Instrument crops come from one locally created score, **"Instrument Reference"**, containing all eleven instruments as tracks; each track holds one bar in which every note style of that instrument appears once in reading order. It is created through the normal `New Song` dialog, stays in the local database only and is not committed. It contains no personal data and is deleted after the crops are captured.

## P2 capture status

Captured so far, against the demo scores `Ijexá` (10004) and `Full` (10002) unless stated otherwise:

| ID   | File                                 | Note                                                                       |
| ---- | ------------------------------------ | -------------------------------------------------------------------------- |
| S-07 | `en/settings/music-font-picker.png`  | Settings dialog with the music font list open, one sample row per font     |
| S-09 | `en/settings/settings-rows.png`      | All five settings rows down to the permission indicator                    |
| S-11 | `en/getting-started/login.png`       | Login dialog, user tab, empty fields                                       |
| S-14 | `en/library/new-score.png`           | Defaults plus three selected instruments (Caixa, Repinique, Tamborim)      |
| S-16 | `en/library/score-menu.png`          | Library tree with the row menu of `Ijexá` open                             |
| S-17 | `en/library/group-access.png`        | Group Access popover: owner, read column with world chip, write, groups    |
| S-21 | `en/staff-editing/note-styles.png`   | Note style bar of the selected Repinique track                             |
| S-24 | `notation/articulations.png`         | Caixa with accents and a ghost note, Surdo Primeira with a damped note     |
| S-26 | `notation/tuplets.png`               | Quintuplet with a triplet nested in its third slot, labels above and below |
| S-28 | `en/staff-editing/selection.png`     | Rectangle selection over two bars, selection popup open                    |
| S-33 | `en/staff-editing/measure-width.png` | Bar 2 narrowed to 340 px next to bar 3 at full width, resize handles shown |
| S-34 | `notation/dynamics.png`              | `f` marking plus a selected decrescendo hairpin with both drag handles     |
| S-36 | —                                    | Not captured: the grid radial note menu was removed                        |
| S-37 | `en/grid-editing/grid-cells.png`     | Two bars at 50 % zoom, accent and ghost variants in four rows              |
| S-38 | `en/playback/playback-bar.png`       | Playback bar with BPM, volume, loop, metronome and count-in                |  | S-39 | `en/playback/play-focus.png` | Bars 2 and 3 carry an active `Play Focus`, mixer sliders show `Mute`/`Focus` |  | S-40 | `en/playback/mixer.png` | Ten tracks, Repinique boosted above 100 %, mute/focus legend under each |
| S-45 | `en/print/printed-page.png`          | First sheet at print scale: title block, two systems, page number          |
| S-47 | `en/presentation/mobile-staff.png`   | 390 × 844, staff view at 70 % zoom, compact playback bar, Zen off          |

Notes on this batch:

- `S-24` comes from an unsaved `New Song` score with Caixa and Surdo Primeira; `S-33` narrows a bar of `Ijexá` in
  edit mode and never saves it.
- `S-36` is dropped: the grid radial note menu was removed in favour of the note style bar both views share.
- `S-34` uses the `Full` score, which carries a crescendo, a decrescendo and one `f` marking; the crop shows the `f`
  together with the decrescendo.
- The Group Access popover is opened from the globe indicator of a library row; the drawer stays out of the crop.
- On the phone the footer folds zoom and version into a menu, so the zoom comes from the stored UI settings.
- `S-45` is the first sheet of the print preview at `Fit page`, with the preview bars hidden. It is the same layout
the PDF carries; the sheet frame is captured instead of rasterising a PDF, because only `qlmanage` is installed.
- `S-26` is captured from an unsaved `New Song` score: two notes, a quintuplet over both, then a triplet inside the
  quintuplet's third slot. A range selection has to start on an existing note, otherwise only the cursor moves.

All P2 motives are captured.

## P3 capture status

| ID   | File                                      | Note                                                                                                        |
| ---- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| S-08 | `en/settings/music-font-info.png`         | Bravura info popup beside the settings rows: version, licence, source                                       |
| S-12 | `en/administration/group-login.png`       | Login dialog, group tab; the demo backend offers no group logins                                            |
| S-13 | `en/administration/first-run.png`         | Finish Installation wizard of an empty database: admin user and group                                       |
| S-15 | `en/library/import-score.png`             | Import dialog with the URL field                                                                            |
| S-18 | `en/administration/users.png`             | Users list with the admin chips                                                                             |
| S-19 | `en/administration/groups.png`            | Groups list with the admin chip per group                                                                   |
| S-22 | `en/staff-editing/note-length.png`        | Note value row with the dotted toggle active                                                                |
| S-23 | `en/staff-editing/articulations.png`      | Caixa note selected: accent and ghost enabled, the damped variant greyed                                    |
| S-25 | `en/staff-editing/subdivisions.png`       | Selection card with the ratio list open, down to Octuplet                                                   |
| S-27 | `en/staff-editing/entry-modes.png`        | Mode bar with `Overwrite` active and `Insert` beside it                                                     |
| S-29 | `en/staff-editing/selection-actions.png`  | Track piece toolbar of one bar: simile and clear                                                            |
| S-30 | `en/staff-editing/bar-actions.png`        | Bar action strip above the bars                                                                             |
| S-31 | `en/staff-editing/track-actions.png`      | Track sidebar kebab open with add, duplicate, clear, delete                                                 |
| S-32 | `en/staff-editing/simile.png`             | Second bar with the simile sign and the track piece toolbar                                                 |
| S-35 | `en/staff-editing/paste-warning.png`      | Toast of a refused paste across instruments, in the grid view                                               |
| S-56 | `en/grid-editing/simile.png`              | Grid view with one track's bar showing only the repeat sign                                                 |
| S-57 | `en/grid-editing/tuplets.png`             | Grid view of a quintuplet with a triplet nested in its third slot                                           |
| S-39 | `en/playback/play-focus.png`              | Play focus on bars 2 and 3, mixer legend below                                                              |
| S-42 | `en/presentation/notification-center.png` | History panel with one message and the do-not-disturb control                                               |
| S-44 | `en/print/preview-controls.png`           | Layout and print detail bars: orientation, borders, scale, tracks                                           |
| S-46 | `en/print/mp3-export.png`                 | Export dialog with the progress bar while the MP3 is rendered                                               |
| S-48 | `en/library/mobile-library.png`           | 390 × 844, library drawer with an open folder                                                               |
| S-49 | `en/presentation/tablet-grid.png`         | 1024 × 768, grid view with the mixer expanded                                                               |
| S-50 | `en/troubleshooting/connection-lost.png`  | Backend Connection Lost dialog with the database error line                                                 |
| S-51 | `en/troubleshooting/error-page.png`       | Error page of the error boundary: warning title, retry and reload, GitHub link, collapsed technical details |
| S-52 | `en/administration/backend-setup.png`     | Backend Setup dialog with engine, host, port and database, offering `Initialize Database`                   |
| S-53 | `en/presentation/release-notes.png`       | Release notes dialog; shows 2.0.0                                                                           |

Notes on this batch:

- A track-piece selection (S-29) comes from a rectangle in the gap below a staff row; a rectangle over the notes
  themselves yields a note selection instead.
- `S-23` shows the real availability: the Caixa has no muted variant, so the `+` button stays disabled.
- `S-25` was taken with the card at the top, so the ratio list runs out of window height and Octuplet is cut.
- The Users & Groups dialog has no tabs: S-18 and S-19 are the two lists of the same dialog.
- `S-12` shows "No groups available", because the demo backend exposes no group logins.
- `S-13` needs an empty database; it was taken against the throwaway database `asb_firstrun`, which is deleted again.
- `S-32` uses the second bar, because the simile action is disabled in the first one.
- `S-50` was captured with the database server stopped; the dialog names the failed connection, and its
  spinner is the reconnect attempt. It has no attempt counter to show.
- `S-39` shows both meanings of focus in one frame: the per-bar `Play Focus` toggles above the bars and the
  `Mute`/`Focus` sliders of the mixer. The bars are 2 and 3, so the active state differs from the neighbours.
- `S-35` and `S-42` come from a maintainer screenshot in normal use: a paste across instruments warns in the grid
  view, and the bell keeps that message in its history. Both were not reproducible from a scripted session.
- `S-42` holds one message, not the two the storyboard asks for: the history only ever showed the paste warning.
- `S-51` is a maintainer screenshot: it needs an unhandled render error, which no scripted session produces. The
  `Technical details` section stays collapsed, which is how the page opens.
- `S-52` was taken while the health endpoint reported `initialized: false`, the state of a database without the
  application tables.

All P3 motives are captured.

- The nine version-dependent captures were re-shot for 2.0.0 on 2026-10-29; see [Version-Dependent Captures](#version-dependent-captures). Neither file name carries a version, so a re-capture replaces the image in place. All of them are linked from `en/using/presentation.md` and `en/staff-editing.md`, and S-58 from the README. 2.0.1 is a patch release, so the captures keep showing 2.0.0 until the next major or minor release.

## Storyboard

| ID    | Pri | Subject                          | Capture context                                                                         | Destination                      | File                                      |
| ----- | --- | -------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------- |
| S-01  | P1  | Full window, staff view, playing | Ijexá, staff view, Light+, Bravura, playhead mid-score                                  | overview, presentation           | `en/presentation/staff-view.png`          |
| S-02  | P1  | Full window, grid view           | Ijexá, grid view, Light+, same scroll position as S-01                                  | overview, presentation           | `en/presentation/grid-view.png`           |
| S-03  | P1  | Zen mode, staff view             | Ijexá, staff view, Zen mode active, labels only in the track column                     | presentation                     | `en/presentation/zen-mode.png`            |
| S-04  | P1  | Score Library open               | Library drawer, a folder with several scores and a shared score visible                 | library                          | `en/library/library-tree.png`             |
| S-05  | P1  | Theme comparison                 | Same two bars of Ijexá in four themes, 2 × 2 montage                                    | presentation                     | `en/presentation/themes.png`              |
| S-06  | P1  | Music font comparison            | Same two bars of Ijexá in Bravura, Leipzig, Petaluma, Sebastian                         | presentation                     | `en/presentation/music-fonts.png`         |
| S-07  | P2  | Settings with font dropdown open | Settings dialog, `Music font` list open with per-font samples                           | presentation                     | `en/settings/music-font-picker.png`       |
| S-08  | P3  | Font information popup           | Settings, font info popup with version, copyright, licence, source                      | presentation                     | `en/settings/music-font-info.png`         |
| S-09  | P2  | Settings, remaining rows         | Settings dialog scrolled to zoom, auto-extend, permission                               | presentation                     | `en/settings/settings-rows.png`           |
| S-10  | —   | Onboarding tutorial (removed)    | Not captured: the tutorial is disabled for 2.0.0 (issue #63)                            | —                                | —                                         |
| S-11  | P2  | Login dialog, user tab           | Login dialog, user tab, empty fields                                                    | first steps                      | `en/getting-started/login.png`            |
| S-12  | P3  | Login dialog, group tab          | Login dialog, group tab with group dropdown                                             | administration                   | `en/administration/group-login.png`       |
| S-13  | P3  | Finish Installation wizard       | Admin user and initial group blocks                                                     | administration                   | `en/administration/first-run.png`         |
| S-14  | P2  | New Song dialog                  | Default values, instrument list with a few selected                                     | library                          | `en/library/new-score.png`                |
| S-15  | P3  | Import Score dialog              | Import dialog with BananaDrum URL example                                               | library                          | `en/library/import-score.png`             |
| S-16  | P2  | Library row menu                 | Score row kebab open with load, copy URL, remove, group access                          | library                          | `en/library/score-menu.png`               |
| S-17  | P2  | Group Access editor              | Owner header, read and write columns with group chips                                   | library, administration          | `en/library/group-access.png`             |
| S-18  | P3  | Users & Groups, users tab        | Two users, admin chip visible, filter field                                             | administration                   | `en/administration/users.png`             |
| S-19  | P3  | Users & Groups, groups tab       | Group list with member counts and admin column                                          | administration                   | `en/administration/groups.png`            |
| S-20  | P1  | Staff edit mode                  | Ijexá, staff view, edit mode, one note selected, toolbars visible                       | staff editing, README            | `en/staff-editing/edit-mode.png`          |
| S-21  | P2  | Note style and technique bar     | Repinique track selected, full style bar with icons                                     | staff editing, instruments       | `en/staff-editing/note-styles.png`        |
| S-22  | P3  | Note length toolbar              | Whole to thirty-second buttons, dotted toggle active                                    | staff editing                    | `en/staff-editing/note-length.png`        |
| S-23  | P3  | Articulation toolbar             | Caixa track, three articulation buttons                                                 | staff editing                    | `en/staff-editing/articulations.png`      |
| S-24  | P2  | Accent, ghost and damped marks   | Cropped bars with all three marks, readable at 100 %                                    | staff editing, instruments intro | `notation/articulations.png`              |
| S-25  | P3  | Subdivision menu                 | Selection popup with the eight ratios visible                                           | staff editing                    | `en/staff-editing/subdivisions.png`       |
| S-26  | P2  | Tuplet notation                  | Triplet and a nested tuplet in one bar, labels above and below                          | staff editing                    | `notation/tuplets.png`                    |
| S-27  | P3  | Entry mode switch                | Mode bar with `Overwrite` active and `Insert` visible                                   | staff editing                    | `en/staff-editing/entry-modes.png`        |
| S-28  | P2  | Selection rectangle              | Staff view, rectangle over two bars, selection highlight                                | staff editing                    | `en/staff-editing/selection.png`          |
| S-29  | P3  | Selection popup                  | Popup with structure actions for a whole-bar selection                                  | staff editing                    | `en/staff-editing/selection-actions.png`  |
| S-30  | P3  | Bar action strip                 | Edit mode strip above three bars with repeat and insert actions                         | staff editing                    | `en/staff-editing/bar-actions.png`        |
| S-31  | P3  | Track actions menu               | Track sidebar kebab open with add, duplicate, clear, delete                             | staff editing                    | `en/staff-editing/track-actions.png`      |
| S-32  | P3  | One-bar repeat                   | Track-piece toolbar with simile button and rendered simile sign                         | staff editing                    | `en/staff-editing/simile.png`             |
| S-33  | P2  | Measure width resizing           | One narrow and one wide bar side by side, resize handle visible                         | staff editing, printing          | `en/staff-editing/measure-width.png`      |
| S-34  | P2  | Dynamics                         | Hairpin and forte mark with drag handles                                                | staff editing, instruments intro | `notation/dynamics.png`                   |
| S-35  | P3  | Paste mismatch warning           | Notification with an instrument mismatch message                                        | staff editing                    | `en/staff-editing/paste-warning.png`      |
| S-36  | —   | Grid radial note menu (removed)  | Not captured: the grid uses the shared note style bar                                   | —                                | —                                         |
| S-37  | P2  | Grid note cells                  | Two bars of grid view with accent and ghost variants visible                            | grid editing                     | `en/grid-editing/grid-cells.png`          |
| S-56  | P2  | Simile in the grid view          | One track's bar shows the repeat sign, the others keep their notes                      | grid editing                     | `en/grid-editing/simile.png`              |
| S-57  | P2  | Nested tuplet in the grid view   | A quintuplet of five slots, the third one split into a triplet                          | grid editing                     | `en/grid-editing/tuplets.png`             |
| S-38  | P2  | Playback bar                     | Playback bar with BPM, volume, loop, metronome, count-in                                | playback                         | `en/playback/playback-bar.png`            |
| S-39  | P3  | Play Focus                       | Two bars marked as play range, others not                                               | playback                         | `en/playback/play-focus.png`              |
| S-40  | P2  | Mixer                            | Expanded mixer with focus boost above 100 % and mute legend                             | playback, presentation           | `en/playback/mixer.png`                   |
| S-41  | P3  | Footer                           | Navigator caption, zoom buttons, Zen toggle, version, notifications                     | presentation                     | `en/presentation/footer.png`              |
| S-42  | P3  | Notification center              | History panel with two informative entries and DND control                              | presentation                     | `en/presentation/notification-center.png` |
| S-43  | P1  | Print preview                    | I-Break, staff view, landscape, two pages visible                                       | printing                         | `en/print/print-preview.png`              |
| S-44  | P3  | Print preview controls           | Controls bar with orientation, borders, scale, tracks                                   | printing                         | `en/print/preview-controls.png`           |
| S-45  | P2  | Printed page                     | PDF page 1 with title block, notation and page number                                   | printing                         | `en/print/printed-page.png`               |
| S-46  | P3  | MP3 export                       | Export progress dialog with score title                                                 | printing                         | `en/print/mp3-export.png`                 |
| S-47  | P2  | Phone, staff view                | 390 × 844, staff view, compact playback bar, Zen off                                    | presentation                     | `en/presentation/mobile-staff.png`        |
| S-48  | P3  | Phone, Score Library             | 390 × 844, library drawer open                                                          | library                          | `en/library/mobile-library.png`           |
| S-49  | P3  | Tablet, grid view                | 1024 × 768, grid view with mixer visible                                                | presentation                     | `en/presentation/tablet-grid.png`         |
| S-50  | P3  | Connection lost                  | Reconnect dialog with attempt counter                                                   | troubleshooting                  | `en/troubleshooting/connection-lost.png`  |
| S-51  | P3  | Error page                       | Error boundary with retry, reload, report, details                                      | troubleshooting                  | `en/troubleshooting/error-page.png`       |
| S-52  | P3  | Backend setup                    | `Initialize Database` dialog with engine, host, port, database                          | installation, troubleshooting    | `en/administration/backend-setup.png`     |
| S-53  | P3  | Release notes dialog             | Dialog with the 2.0.0 notes once written                                                | presentation                     | `en/presentation/release-notes.png`       |
| S-54a | P1  | Agogô 2-Bell notation            | Reference score, Agogô 2-Bell track, both bells, accent and ghost                       | instruments                      | `notation/agogo-2-bell.png`               |
| S-54b | P1  | Agogô 4-Bell notation            | Four bells on four lines                                                                | instruments                      | `notation/agogo-4-bell.png`               |
| S-54c | P1  | Chocalho notation                | Accent and ghost variants                                                               | instruments                      | `notation/chocalho.png`                   |
| S-54d | P1  | Tamborim notation                | Accent and ghost variants                                                               | instruments                      | `notation/tamborim.png`                   |
| S-54e | P1  | Repinique notation               | All seven styles, including rim shot, rim, buzz, open and slap                          | instruments                      | `notation/repinique.png`                  |
| S-54f | P1  | Repinique Whippy notation        | Accent and ghost variants                                                               | instruments                      | `notation/repinique-whippy.png`           |
| S-54g | P1  | Caixa notation                   | Normal, ghost, press roll, rim shot                                                     | instruments                      | `notation/caixa.png`                      |
| S-54h | P1  | Timbau notation                  | Open, slap and bass                                                                     | instruments                      | `notation/timbau.png`                     |
| S-54i | P1  | Surdo Terceira notation          | Center and muted                                                                        | instruments                      | `notation/surdo-terceira.png`             |
| S-54j | P1  | Surdo Segunda notation           | Center and muted                                                                        | instruments                      | `notation/surdo-segunda.png`              |
| S-54k | P1  | Surdo Primeira notation          | Center and muted                                                                        | instruments                      | `notation/surdo-primeira.png`             |
| S-55  | P2  | Demo entry                       | Demo access screen once the separate task is implemented                                | overview, first steps            | `en/getting-started/demo-access.png`      |
| S-58  | P1  | README hero, tablet              | I-Break, staff view at 100 % zoom, tablet 1024 × 768, Zen mode, framed as an iPad       | README hero, website hero        | `en/presentation/tablet-zen-mode.png`     |
| S-59  | P1  | Website hero, grid               | Same capture as S-58 with the grid view instead of the staff view, nothing else changed | website hero only                | `en/presentation/tablet-zen-grid.png`     |

## Priority

- **P1** (19 images): required for the release — hero views, both views, Zen mode, library, themes, fonts, staff
  editing overview, print preview, and the eleven instrument crops.
- **P2**: makes chapters genuinely useful and complete.
- **P3**: supporting detail; can follow the handbook draft without blocking review.

## README Image Set (Phase 5)

Two images, in this order:

1. S-58 tablet in Zen mode showing I-Break, the README hero, with S-59 as its unlinked grid counterpart
2. S-20 staff edit mode

The gallery a first draft carried (S-01 staff view, S-04 Score Library, S-05 themes, S-06 fonts) was removed on
2026-10-29; those images stay in the handbook chapters that use them. The README does not repeat the instrument
crops; it links to `docs/en/instruments.md` instead.

S-58 and S-59 are framed as a tablet. The frame is drawn in CSS around the genuine capture and is never part of the
application: a 1080 × 824 body with a 28 px bezel, 44 px corner radius, a dark gradient edge and a camera dot, the
1024 × 768 screen at device scale factor 2, a stage that leaves 60 px above, 100 px at the sides and 140 px below for
the drop shadow, exported with a transparent margin at 1280 px width. Both variants come from one capture pass and
differ only in the view switch, so they can sit side by side. Any device frame in a later capture follows the same
rule: real screen content, decorative frame.

S-59 is not linked from the README or from a handbook chapter. It pairs with the README hero for the website project,
which uses the staff and grid variant together; the handbook keeps its own grid and staff images per chapter.

## Comparison Images

S-05 and S-06 are montages of the same bars. Both are produced from one capture pass:

- Fixed crop of two bars, identical scroll position and zoom, no selection, no playhead.
- Themes: `Light+`, `Dark+`, `Monokai Dimmed`, `Solarized Light` — one light and three dark variants, arranged 2 × 2
  with the theme name as caption inside the image and in the alt text.
- Fonts: `Bravura`, `Leipzig`, `Petaluma`, `Sebastian` — four visibly different engraving styles, same two bars,
  stacked vertically with the font name as caption.
- Keep both source captures and the montage script under `docs/images/sources/` (not published) so the comparison can
  be rebuilt when a theme or font changes.

## Retake Triggers

A capture is redone when any of these change: header or footer layout, toolbar layout, default theme, bundled fonts, instrument note styles, print preview controls, the demo scores, or the application version. The capture context column names what to keep identical; anything not listed may change freely.

## Version-Dependent Captures

The version is baked into the pixels of every capture whose frame shows the footer. No link or asset check sees it, so the list is kept by hand and re-captured together with a major or minor version change. A patch release leaves the captures alone, so until the next major or minor release they show the version that release carried. File names carry no version, so a re-capture replaces the image in place.

| ID   | File                                  | Why                                    |
| ---- | ------------------------------------- | -------------------------------------- |
| S-01 | `en/presentation/staff-view.png`      | Full window, footer in frame           |
| S-02 | `en/presentation/grid-view.png`       | Full window, footer in frame           |
| S-03 | `en/presentation/zen-mode.png`        | Zen mode keeps the footer              |
| S-20 | `en/staff-editing/edit-mode.png`      | Full window, footer in frame           |
| S-41 | `en/presentation/footer.png`          | The footer itself, shows `v<version>`  |
| S-49 | `en/presentation/tablet-grid.png`     | Tablet, footer in frame                |
| S-53 | `en/presentation/release-notes.png`   | Dialog with the newest version heading |
| S-58 | `en/presentation/tablet-zen-mode.png` | README hero, footer in frame           |
| S-59 | `en/presentation/tablet-zen-grid.png` | Website hero, footer in frame          |

Unaffected: the notation crops, the theme and music-font montages, the print preview, and S-47 on the phone, whose footer folds the version into a menu.
