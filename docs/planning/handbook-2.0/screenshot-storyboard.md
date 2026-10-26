# Animada Score Book 2.0 — Screenshot and Notation Storyboard

- Status: Phase 1 draft for maintainer review (issue #62)
- Scope: every image the handbook and the refreshed README need, with capture context so images can be reproduced
- Dependency: Ijexá and I-Break demo scores. The maintainer empties the database and adds both scores before Phase 4
  starts; until then the corresponding captures stay blocked
- Storage: `docs/images/en/` for screenshots with English UI, `docs/images/notation/` for notation crops without UI
  text. `docs/grid-view.png` and `docs/staff-view.png` are from before 1.3.0 and are replaced, not reused

## Capture Conventions

| Aspect         | Convention                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Browser        | Chromium, same version as the Playwright suite                                                                 |
| Desktop size   | 1440 × 900 CSS px, device scale factor 2, exported at 1440 × 900                                               |
| Tablet size    | 1024 × 768                                                                                                     |
| Phone size     | 390 × 844                                                                                                      |
| Theme          | `Light+` unless the row says otherwise; dark captures use `Dark+`                                              |
| Music font     | `Bravura` unless the row shows font differences                                                                |
| Zoom           | 100 %, playback stopped, no selection, Zen mode off — unless the row requires the opposite                     |
| Chrome         | Header and footer complete, no open menus, except where the row documents a menu, popup or dialog              |
| Notifications  | Dismissed, so no stale toasts appear in any image                                                              |
| Score content  | Ijexá for general views, I-Break where a second piece helps, the notation reference score for instrument crops |
| Personal data  | No real member names, e-mail addresses or private scores; check score titles and user menus before capture     |
| File naming    | `<topic>-<subject>.png`; instrument crops `<instrument>.png`                                                   |
| Optimization   | PNG, `oxipng`/`pngquant`; full-window images target < 300 kB, notation crops < 80 kB                           |
| Alt text       | Describes the visible content ("Staff view of Ijexá with the note style bar open"), never "screenshot of …"    |
| Record keeping | The capture context column is the record; re-capture from the same score, theme, font and viewport             |

## Documentation Example Score

Instrument crops come from one locally created score, **"Instrument Reference"**, containing all eleven instruments
as tracks; each track holds one bar in which every note style of that instrument appears once in reading order. It is
created through the normal `New Song` dialog, stays in the local database only and is not committed. It contains no
personal data and is deleted after the crops are captured.

## Storyboard

| ID    | Pri | Subject                          | Capture context                                                         | Destination                         | File                                      |
| ----- | --- | -------------------------------- | ----------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------- |
| S-01  | P1  | Full window, staff view, playing | Ijexá, staff view, Light+, Bravura, playhead mid-score                  | overview, presentation, README hero | `en/presentation/staff-view.png`          |
| S-02  | P1  | Full window, grid view           | Ijexá, grid view, Light+, same scroll position as S-01                  | overview, presentation, README hero | `en/presentation/grid-view.png`           |
| S-03  | P1  | Zen mode, staff view             | Ijexá, staff view, Zen mode active, labels only in the track column     | presentation, README showcase       | `en/presentation/zen-mode.png`            |
| S-04  | P1  | Score Library open               | Library drawer, a folder with several scores and a shared score visible | library, README showcase            | `en/library/library-tree.png`             |
| S-05  | P1  | Theme comparison                 | Same two bars of Ijexá in four themes, 2 × 2 montage                    | presentation, README showcase       | `en/presentation/themes.png`              |
| S-06  | P1  | Music font comparison            | Same two bars of Ijexá in Bravura, Leipzig, Petaluma, Sebastian         | presentation, README showcase       | `en/presentation/music-fonts.png`         |
| S-07  | P2  | Settings with font dropdown open | Settings dialog, `Music font` list open with per-font samples           | presentation                        | `en/settings/music-font-picker.png`       |
| S-08  | P3  | Font information popup           | Settings, font info popup with version, copyright, licence, source      | presentation                        | `en/settings/music-font-info.png`         |
| S-09  | P2  | Settings, remaining rows         | Settings dialog scrolled to zoom, auto-extend, permission                 | presentation                        | `en/settings/settings-rows.png`           |
| S-10  | —   | Onboarding tutorial (removed)    | Not captured: the tutorial is disabled for 2.0.0 (issue #63)               | —                                   | —                                         |
| S-11  | P2  | Login dialog, user tab           | Login dialog, user tab, empty fields                                    | first steps                         | `en/getting-started/login.png`            |
| S-12  | P3  | Login dialog, group tab          | Login dialog, group tab with group dropdown                             | administration                      | `en/administration/group-login.png`       |
| S-13  | P3  | Finish Installation wizard       | Admin user and initial group blocks                                     | administration                      | `en/administration/first-run.png`         |
| S-14  | P2  | New Song dialog                  | Default values, instrument list with a few selected                     | library                             | `en/library/new-score.png`                |
| S-15  | P3  | Import Score dialog              | Import dialog with BananaDrum URL example                               | library                             | `en/library/import-score.png`             |
| S-16  | P2  | Library row menu                 | Score row kebab open with load, copy URL, remove, group access          | library                             | `en/library/score-menu.png`               |
| S-17  | P2  | Group Access editor              | Owner header, read and write columns with group chips                   | library, administration             | `en/library/group-access.png`             |
| S-18  | P3  | Users & Groups, users tab        | Two users, admin chip visible, filter field                             | administration                      | `en/administration/users.png`             |
| S-19  | P3  | Users & Groups, groups tab       | Group list with member counts and admin column                          | administration                      | `en/administration/groups.png`            |
| S-20  | P1  | Staff edit mode                  | Ijexá, staff view, edit mode, one note selected, toolbars visible       | staff editing, README showcase      | `en/staff-editing/edit-mode.png`          |
| S-21  | P2  | Note style and technique bar     | Repinique track selected, full style bar with icons                     | staff editing, instruments          | `en/staff-editing/note-styles.png`        |
| S-22  | P3  | Note length toolbar              | Whole to thirty-second buttons, dotted toggle active                    | staff editing                       | `en/staff-editing/note-length.png`        |
| S-23  | P3  | Articulation toolbar             | Caixa track, three articulation buttons                                 | staff editing                       | `en/staff-editing/articulations.png`      |
| S-24  | P2  | Accent, ghost and damped marks   | Cropped bars with all three marks, readable at 100 %                    | staff editing, instruments intro    | `notation/articulations.png`              |
| S-25  | P3  | Subdivision menu                 | Selection popup with the eight ratios visible                           | staff editing                       | `en/staff-editing/subdivisions.png`       |
| S-26  | P2  | Tuplet notation                  | Triplet and a nested tuplet in one bar, labels above and below          | staff editing                       | `notation/tuplets.png`                    |
| S-27  | P3  | Entry mode switch                | Mode bar with `Overwrite` active and `Insert` visible                   | staff editing                       | `en/staff-editing/entry-modes.png`        |
| S-28  | P2  | Selection rectangle              | Staff view, rectangle over two bars, selection highlight                | staff editing                       | `en/staff-editing/selection.png`          |
| S-29  | P3  | Selection popup                  | Popup with structure actions for a whole-bar selection                  | staff editing                       | `en/staff-editing/selection-actions.png`  |
| S-30  | P3  | Bar action strip                 | Edit mode strip above three bars with repeat and insert actions         | staff editing                       | `en/staff-editing/bar-actions.png`        |
| S-31  | P3  | Track actions menu               | Track sidebar kebab open with add, duplicate, clear, delete             | staff editing                       | `en/staff-editing/track-actions.png`      |
| S-32  | P3  | One-bar repeat                   | Track-piece toolbar with simile button and rendered simile sign         | staff editing                       | `en/staff-editing/simile.png`             |
| S-33  | P2  | Measure width resizing           | One narrow and one wide bar side by side, resize handle visible         | staff editing, printing             | `en/staff-editing/measure-width.png`      |
| S-34  | P2  | Dynamics                         | Hairpin and forte mark with drag handles                                | staff editing, instruments intro    | `notation/dynamics.png`                   |
| S-35  | P3  | Paste mismatch warning           | Notification with an instrument mismatch message                        | staff editing                       | `en/staff-editing/paste-warning.png`      |
| S-36  | P2  | Grid radial note menu            | Grid cell with the radial style fan open                                | grid editing                        | `en/grid-editing/radial-menu.png`         |
| S-37  | P2  | Grid note cells                  | Two bars of grid view with accent and ghost variants visible            | grid editing                        | `en/grid-editing/grid-cells.png`          |
| S-38  | P2  | Playback bar                     | Playback bar with BPM, volume, loop, metronome, count-in                | playback                            | `en/playback/playback-bar.png`            |
| S-39  | P3  | Play Focus                       | Two bars marked as play range, others not                               | playback                            | `en/playback/play-focus.png`              |
| S-40  | P2  | Mixer                            | Expanded mixer with focus boost above 100 % and mute legend             | playback, presentation              | `en/playback/mixer.png`                   |
| S-41  | P3  | Footer                           | Navigator caption, zoom buttons, Zen toggle, version, notifications     | presentation                        | `en/presentation/footer.png`              |
| S-42  | P3  | Notification center              | History panel with two informative entries and DND control              | presentation                        | `en/presentation/notification-center.png` |
| S-43  | P1  | Print preview                    | I-Break, staff view, landscape, two pages visible                       | printing                            | `en/print/print-preview.png`              |
| S-44  | P3  | Print preview controls           | Controls bar with orientation, borders, scale, tracks                   | printing                            | `en/print/preview-controls.png`           |
| S-45  | P2  | Printed page                     | PDF page 1 with title block, notation and page number                   | printing                            | `en/print/printed-page.png`               |
| S-46  | P3  | MP3 export                       | Export progress dialog with score title                                 | printing                            | `en/print/mp3-export.png`                 |
| S-47  | P2  | Phone, staff view                | 390 × 844, staff view, compact playback bar, Zen off                    | presentation                        | `en/presentation/mobile-staff.png`        |
| S-48  | P3  | Phone, Score Library             | 390 × 844, library drawer open                                          | library                             | `en/library/mobile-library.png`           |
| S-49  | P3  | Tablet, grid view                | 1024 × 768, grid view with mixer visible                                | presentation                        | `en/presentation/tablet-grid.png`         |
| S-50  | P3  | Connection lost                  | Reconnect dialog with attempt counter                                   | troubleshooting                     | `en/troubleshooting/connection-lost.png`  |
| S-51  | P3  | Error page                       | Error boundary with retry, reload, report, details                      | troubleshooting                     | `en/troubleshooting/error-page.png`       |
| S-52  | P3  | Backend setup                    | `Initialize Database` dialog with engine, host, port, database          | installation, troubleshooting       | `en/administration/backend-setup.png`     |
| S-53  | P3  | Release notes dialog             | Dialog with the 2.0.0 notes once written                                | presentation                        | `en/presentation/release-notes.png`       |
| S-54a | P1  | Agogô notation                   | Instrument reference score, Agogô track, both bells, accent and ghost   | instruments                         | `notation/agogo.png`                      |
| S-54b | P1  | 4-Bell Agogo notation            | Four bells on four lines                                                | instruments                         | `notation/agogo-4-bell.png`               |
| S-54c | P1  | Chocalho notation                | Accent and ghost variants                                               | instruments                         | `notation/chocalho.png`                   |
| S-54d | P1  | Tamborim notation                | Accent and ghost variants                                               | instruments                         | `notation/tamborim.png`                   |
| S-54e | P1  | Repinique notation               | All seven styles, including rim shot, rim, buzz, open and slap          | instruments                         | `notation/repinique.png`                  |
| S-54f | P1  | Repinique Whippy notation        | Accent and ghost variants                                               | instruments                         | `notation/repinique-whippy.png`           |
| S-54g | P1  | Caixa notation                   | Normal, ghost, press roll, rim shot                                     | instruments                         | `notation/caixa.png`                      |
| S-54h | P1  | Timbau notation                  | Open, slap and bass                                                     | instruments                         | `notation/timbau.png`                     |
| S-54i | P1  | Terceira Surdo notation          | Center and muted                                                        | instruments                         | `notation/surdo-terceira.png`             |
| S-54j | P1  | Mid Surdo notation               | Center and muted                                                        | instruments                         | `notation/surdo-mid.png`                  |
| S-54k | P1  | Low Surdo notation               | Center and muted                                                        | instruments                         | `notation/surdo-low.png`                  |
| S-55  | P2  | Demo entry                       | Demo access screen once the separate task is implemented                | overview, first steps               | `en/getting-started/demo-access.png`      |

## Priority

- **P1** (19 images): required for the release — hero views, both views, Zen mode, library, themes, fonts, staff
  editing overview, print preview, and the eleven instrument crops.
- **P2**: makes chapters genuinely useful and complete.
- **P3**: supporting detail; can follow the handbook draft without blocking review.

## README Image Set (Phase 5)

Six images, in this order:

1. S-01 staff view with playback
2. S-03 Zen mode
3. S-04 Score Library
4. S-05 theme comparison
5. S-06 music font comparison
6. S-20 staff edit mode

The README does not repeat the instrument crops; it links to `docs/en/instruments.md` instead.

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

A capture is redone when any of these change: header or footer layout, toolbar layout, default theme, bundled fonts,
instrument note styles, print preview controls, or the demo scores. The capture context column names what to keep
identical; anything not listed may change freely.
