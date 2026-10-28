# Animada Score Book 2.0 — Documentation Coverage Checklist

- Status: Phase 1 draft for maintainer review (issue #62)
- Method: every row was derived from the running UI code (components, dialogs, menus, handlers, enums, instrument
  definitions, server routes and config), not from earlier documentation
- Destination values refer to pages in [`table-of-contents.md`](table-of-contents.md); `S-xx` values refer to
  [`screenshot-storyboard.md`](screenshot-storyboard.md)
- "Verify" marks statements that must be re-checked against the running application during Phase 6

## A. Product and Getting Started

| ID   | Feature                                                                     | UI location                   | Destination                      | Image                              | Notes                                                                  |
| ---- | --------------------------------------------------------------------------- | ----------------------------- | -------------------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| A-01 | Product purpose and audience                                                | —                             | `getting-started/overview.md`    | S-01                               | Describe Samba/Bateria use, not generic notation software              |
| A-02 | Two-part architecture (backend + browser frontend)                          | —                             | `getting-started/overview.md`    | —                                  | Explain what "running locally" and "hosted" both mean                  |
| A-03 | Core concepts: score, track, bar, instrument, note style, articulation      | Header identity, track column | `getting-started/overview.md`    | S-01                               | Terms fixed in `audit.md` → Terminology                                |
| A-04 | Supported meters in New Song (4/4, 6/8, 5/4, 7/8)                           | `New Song` dialog             | `getting-started/overview.md`    | S-14                               | Meter list is fixed by the dialog                                      |
| A-05 | Browser requirements (Web Audio, localStorage, MP3 encoding, ES-next build) | —                             | `getting-started/overview.md`    | —                                  | No browser support statement exists in the repo; state tested browsers |
| A-06 | Desktop, tablet and phone support                                           | Responsive layout             | `getting-started/overview.md`    | S-47                               | Cross-link presentation chapter                                        |
| A-07 | Demo access (planned; separate application task)                            | Login dialog / demo entry     | `getting-started/overview.md`    | S-55                               | Document agreed behaviour only once implemented                        |
| A-08 | Onboarding tutorial (disabled in 2.0.0)                                     | Out of scope — issue #63      | —                                | Tutorial rework tracked separately |
| A-09 | Sign-in options: user, group, continue anonymously                          | Login dialog                  | `getting-started/first-steps.md` | S-11                               | Group tab documented in administration chapter too                     |
| A-10 | Opening a score: library, direct `?score=` URL, shared link                 | Library, URL                  | `getting-started/first-steps.md` | S-04                               | Access-denied and not-found dialogs belong to troubleshooting          |
| A-11 | First playback and view switch                                              | Playback bar, view switch     | `getting-started/first-steps.md` | S-38                               | Short workflow, details in chapter 5 and 8                             |
| A-12 | Where settings, version, release notes and help live                        | Header gear, footer version   | `getting-started/first-steps.md` | S-41                               | Releases notes dialog: S-53                                            |
| A-13 | Saving behaviour: save badge, `Save Score`, unsaved-changes prompt          | Header identity, save switch  | `getting-started/first-steps.md` | S-01                               | Anonymous versus persistent saving must be explicit                    |

## B. Score Library

| ID   | Feature                                                                | UI location                   | Destination              | Image | Notes                                                         |
| ---- | ---------------------------------------------------------------------- | ----------------------------- | ------------------------ | ----- | ------------------------------------------------------------- |
| B-01 | Open and close the library, Escape behaviour                           | Header library button, drawer | `using/score-library.md` | S-04  | Drawer stacks over the score                                  |
| B-02 | Tree structure: folders and scores, nesting                            | Library tree                  | `using/score-library.md` | S-04  | Call it "library tree", not "Score Tree"                      |
| B-03 | Load a score by double-click                                           | Library row                   | `using/score-library.md` | S-16  | Row context menu also offers `Load Score`                     |
| B-04 | Create folder / subfolder                                              | Header button, row menu       | `using/score-library.md` | —     | `Add New Folder`, `Add New Sub Folder`                        |
| B-05 | Rename and remove folders                                              | Row menu                      | `using/score-library.md` | —     | Removal requires an empty folder                              |
| B-06 | Create a score: title, meter, bars, tempo, instruments, select all     | `New Song` dialog             | `using/score-library.md` | S-14  | Last-used settings are remembered per browser                 |
| B-07 | Import a BananaDrum score URL                                          | `Import Score` dialog         | `using/score-library.md` | S-15  | Clipboard prefill; result is a new score in the chosen folder |
| B-08 | Copy a share URL                                                       | Score row menu                | `using/score-library.md` | S-16  | URL shape `?score=<id>`                                       |
| B-09 | Rename and remove a score                                              | Score row menu                | `using/score-library.md` | S-16  | Permission requirement must be stated                         |
| B-10 | `Group Access` editor: owner, read/write groups, drag and drop         | Row menu → `PermissionEditor` | `using/score-library.md` | S-17  | Full model in administration chapter                          |
| B-11 | `Reset Children` on folders                                            | Permission editor             | `using/score-library.md` | S-17  | Recursive inheritance reset                                   |
| B-12 | Permission indicators (read-only, public) and the setting to hide them | Library rows, Settings        | `using/score-library.md` | S-04  | Setting label `Show permission indicator`                     |
| B-13 | Breadcrumb and save state in the header                                | `ArrangementIdentity`         | `using/score-library.md` | S-01  | `Saved` / `Unsaved changes` / `Unchanged`                     |
| B-14 | What anonymous and read-only users can do in the library               | Library                       | `using/score-library.md` | —     | Backend decides; explain the visible result                   |
| B-15 | Access restricted / score not found prompts                            | Confirm dialog                | `troubleshooting.md`     | —     | Entry point `Sign In`                                         |
| B-16 | Score locking and the "edited by" message                              | Edit mode switch              | `using/score-library.md` | —     | 30-minute lock, see limitations                               |

## C. Presentation, Navigation and Comfort

| ID   | Feature                                                                 | UI location               | Destination             | Image      | Notes                                                      |
| ---- | ----------------------------------------------------------------------- | ------------------------- | ----------------------- | ---------- | ---------------------------------------------------------- |
| C-01 | Grid view and staff view, switch by button, `G` and `S`                 | View switch               | `using/presentation.md` | S-01, S-02 | Floating bar is draggable                                  |
| C-02 | Grid view: matrix of bars and tracks, symbol per cell, colors           | Grid view                 | `using/presentation.md` | S-02       | Differences in editing: chapter 7                          |
| C-03 | Staff view: note rows, percussion clef, time signature, measure window  | Staff view                | `using/presentation.md` | S-01       | Windowed rendering is invisible to users; do not expose it |
| C-04 | Music font setting, seven fonts, samples in the dropdown                | Settings → `Music font`   | `using/presentation.md` | S-06, S-07 | Font list from `public/fonts/smufl/index.json`             |
| C-05 | Music font licence popup (`Version`, `Copyright`, `Licence`, `Source`)  | Settings → info button    | `using/presentation.md` | S-08       | Licence information must stay visible                      |
| C-06 | Color theme setting: `Auto`, four light and nine dark themes            | Settings → `Color theme`  | `using/presentation.md` | S-05       | `Auto` follows the operating system                        |
| C-07 | Zoom: footer buttons, `Track viewer zoom` (50–150 %), `Reset`           | Footer, Settings          | `using/presentation.md` | S-41       | Manual only; no pinch or wheel zoom                        |
| C-08 | Zen mode: hides chrome, pointer panning, label-only track column        | Footer → `Enter Zen mode` | `using/presentation.md` | S-03       | Escape does not clear the selection in Zen mode            |
| C-09 | Score navigator with position caption                                   | Footer                    | `using/presentation.md` | S-41       | `Bar 5 of 32` / `Bars 5 – 9 of 32`                         |
| C-10 | Notification center: toasts, 15-second auto-hide, history, DND, clear   | Footer bell               | `using/presentation.md` | S-42       | Also used for errors and lock conflicts                    |
| C-11 | Version display and release notes dialog                                | Footer version button     | `using/presentation.md` | S-53       | Links to `release-notes.md`                                |
| C-12 | Header layout, overflow menu at ≤ 900 px                                | Header                    | `using/presentation.md` | S-01       | Do not document pixel values; describe behaviour           |
| C-13 | Mobile: compact header, collapsed controls, responsive layout           | ≤ 600 px layout           | `using/presentation.md` | S-47       | Both views stay usable on a phone                          |
| C-14 | Tablet landscape layout                                                 | Medium width              | `using/presentation.md` | S-49       | Implicit through the layout description                    |
| C-15 | Editing the score title in edit mode                                    | Header identity           | `using/presentation.md` | S-20       | Also mentioned in staff editing                            |
| C-16 | Mixer column: instrument icons, names, volume sliders                   | Left column               | `using/presentation.md` | S-40       | Playback behaviour in chapter 8                            |
| C-17 | Backend health screens: `Server Unreachable`, `Connection Error`, retry | Startup                   | `troubleshooting.md`    | S-52       | Administrator action: start the backend                    |
| C-18 | Connection lost dialog and restored notification                        | Runtime                   | `troubleshooting.md`    | S-50       | Escape disabled while reconnecting                         |
| C-19 | Error page with retry, reload, GitHub report, technical details         | Error boundary            | `troubleshooting.md`    | S-51       | Copy details redacts secrets                               |
| C-20 | Theme scope: whole UI chrome and score colours                          | Everywhere                | `using/presentation.md` | S-05       | Font is a separate setting                                 |

## D. Staff View Editing

| ID   | Feature                                                                          | UI location              | Destination                       | Image      | Notes                                                           |
| ---- | -------------------------------------------------------------------------------- | ------------------------ | --------------------------------- | ---------- | --------------------------------------------------------------- |
| D-01 | Enter and leave edit mode, score lock, permission and session errors             | Header edit switch       | `using/staff-editing.md`          | S-20       | Lock message, 30-minute timeout                                 |
| D-02 | Save with button and `Ctrl/Cmd+S`                                                | Header                   | `using/staff-editing.md`          | —          | Save switch appears only with pending changes                   |
| D-03 | Note style and technique bar, one button per style, rest button                  | Toolbar                  | `using/staff-editing.md`          | S-21       | Labels come from the instrument definitions                     |
| D-04 | Note length toolbar, whole to thirty-second, dotted value                        | Toolbar                  | `using/staff-editing.md`          | S-22       | Staff view only                                                 |
| D-05 | Articulations `Accent`, `Damped`, `Ghost` and when they are offered              | Toolbar                  | `using/staff-editing.md`          | S-23, S-24 | Availability derived from the instrument's styles               |
| D-06 | Entry modes `Overwrite` and `Insert`, keys `O` and `I`                           | Mode bar                 | `using/staff-editing.md`          | S-27       | Grid is always overwrite                                        |
| D-07 | Keyboard entry: `1`–`9`, `0`, `Alt/Cmd+1`–`6`, `Alt/Cmd+.`                       | Score                    | `reference/keyboard-shortcuts.md` | —          | Summarised in the workflow chapter, complete table in reference |
| D-08 | Arrow-key cursor movement across bars and tracks                                 | Score                    | `using/staff-editing.md`          | —          | Cursor wraps; document the visible cursor                       |
| D-09 | `Delete` and `Backspace` removal                                                 | Score                    | `using/staff-editing.md`          | —          | Include rest handling                                           |
| D-10 | Selection: click, Shift-click, rectangle drag, edge auto-scroll, Escape          | Score                    | `using/staff-editing.md`          | S-28       | Granularity follows the dragged area                            |
| D-11 | Selection popup with context actions                                             | Floating popup           | `using/staff-editing.md`          | S-29       | Groups adapt to the selection                                   |
| D-12 | Subdivisions: `Add subdivision` with eight ratios, nesting                       | Selection popup          | `using/staff-editing.md`          | S-25, S-26 | Theory explanation limited to what is needed                    |
| D-13 | Paste subdivision: `New Subdivision`, `Tile Subdivision`, `Dissolve Subdivision` | Paste prompt             | `using/staff-editing.md`          | —          | Explain the three outcomes                                      |
| D-14 | Bar actions: insert left/right, clear, delete, duplicate, repeat start/end       | Action strip             | `using/staff-editing.md`          | S-30       | Repeat marks and playback order                                 |
| D-15 | Track actions: add, duplicate, clear, delete                                     | Track action sidebar     | `using/staff-editing.md`          | S-31       | `Add Tracks` multi-select dialog                                |
| D-16 | One-bar repeat (simile) and its first-bar restriction                            | Track-piece toolbar      | `using/staff-editing.md`          | S-32       | Playback resolves the mark (ADR-0015, ADR-0017)                 |
| D-17 | Clear a track piece                                                              | Track-piece toolbar      | `using/staff-editing.md`          | S-32       | —                                                               |
| D-18 | Measure width resize by dragging the closing barline, double-click reset         | Staff bar                | `using/staff-editing.md`          | S-33       | Also available in the print preview                             |
| D-19 | Dynamics: `Crescendo`, `Decrescendo`, `Forte`, placing mode, drag and resize     | Tools bar                | `using/staff-editing.md`          | S-34       | Escape leaves placing mode; playback effect documented          |
| D-20 | Clipboard: copy, cut, paste; paste creating a track; mismatch warnings           | Shortcuts, context       | `using/staff-editing.md`          | S-35       | Messages about instrument, meter and track count mismatches     |
| D-21 | Undo and redo, one gesture equals one step                                       | Header, shortcuts        | `using/staff-editing.md`          | —          | `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl+Y`                      |
| D-22 | Auto-extend the score when entering past the last bar                            | Settings                 | `using/staff-editing.md`          | —          | Default on; explain the alternative                             |
| D-23 | Whole-bar rest structure and selection                                           | Score                    | `using/staff-editing.md`          | —          | Rest runs stay visible and selectable                           |
| D-24 | Beams, flags and stem direction rules as the user sees them                      | Score                    | `using/staff-editing.md`          | S-01       | Only visible rules, no engraving internals                      |
| D-25 | Clicking a note plays its sample                                                 | Score                    | `using/playback.md`               | —          | Master volume applies                                           |
| D-26 | Track colors and icons as identification                                         | Mixer column, staff rows | `using/presentation.md`           | S-40       | Color comes from the instrument definition                      |
| D-27 | Selection survives a reload                                                      | On load                  | `using/staff-editing.md`          | —          | Verify that this is reliably user-visible before documenting    |

## E. Grid View Editing

| ID   | Feature                                                    | UI location | Destination             | Image | Notes                                                |
| ---- | ---------------------------------------------------------- | ----------- | ----------------------- | ----- | ---------------------------------------------------- |
| E-01 | The grid raster: fixed steps per bar, one cell per step    | Grid view   | `using/grid-editing.md` | S-02  | Raster differs from free staff fractions             |
| E-02 | Enter and remove notes in the grid                         | Grid cells  | `using/grid-editing.md` | S-37  | Same keys as staff where applicable                  |
| E-03 | Note styles come from the shared note style bar            | Grid cell   | `using/grid-editing.md` | S-21  | The radial note menu was removed                     |
| E-04 | Toolbar availability in grid mode (no note length toolbar) | Toolbar     | `using/grid-editing.md` | S-21  | Unavailable controls are hidden                      |
| E-05 | Selection and rectangle selection in the grid              | Grid view   | `using/grid-editing.md` | —     | Granularity differs from staff                       |
| E-06 | Subdivisions shown inside grid cells                       | Grid view   | `using/grid-editing.md` | S-37  | Sub-step notes appear as synthetic subdivision       |
| E-07 | What the grid cannot do compared with the staff view       | Grid view   | `using/grid-editing.md` | —     | No free fractions, no measure width, no dynamics     |
| E-08 | Switching views during an edit session                     | View switch | `using/grid-editing.md` | —     | Verify that selection and cursor behave as described |
| E-09 | Play Focus and playback from the grid                      | Bar header  | `using/playback.md`     | S-39  | Shared behaviour with staff view                     |
| E-10 | Grid cell color mix from the instrument color              | Grid cells  | `using/presentation.md` | S-02  | Cosmetic, one sentence                               |

## F. Playback and Practice

| ID   | Feature                                                       | UI location           | Destination         | Image | Notes                                                  |
| ---- | ------------------------------------------------------------- | --------------------- | ------------------- | ----- | ------------------------------------------------------ |
| F-01 | Play and stop, tooltips                                       | Playback bar          | `using/playback.md` | S-38  | Space bar is not a shortcut; do not imply it           |
| F-02 | Tempo stepper 30–200 BPM, step 5, deviation marker            | Playback bar          | `using/playback.md` | S-38  | `118*` marker explained                                |
| F-03 | Master volume slider 0–100 %                                  | Playback bar          | `using/playback.md` | S-38  | —                                                      |
| F-04 | Per-track mixer 0–2, mute range, focus boost, expand/collapse | Mixer column          | `using/playback.md` | S-40  | Focus boost attenuates other tracks                    |
| F-05 | Metronome toggle                                              | Playback bar          | `using/playback.md` | S-38  | —                                                      |
| F-06 | Count-in, one bar, Portuguese number samples                  | Playback bar          | `using/playback.md` | S-38  | Count-in voice is not a selectable instrument          |
| F-07 | Loop playback                                                 | Playback bar          | `using/playback.md` | S-38  | Loop is excluded from MP3 export                       |
| F-08 | Play Focus: per-bar playback range selection                  | Bar headers           | `using/playback.md` | S-39  | Empty selection means the whole score                  |
| F-09 | Playhead, automatic scrolling, windowed staff rendering       | Score                 | `using/playback.md` | S-01  | Describe as smooth following, not as an implementation |
| F-10 | Repeat-aware playback order, duration and position            | Status bar, navigator | `using/playback.md` | S-41  | Repeats and simile change the performed length         |
| F-11 | Playback while editing, switching views during playback       | Score                 | `using/playback.md` | —     | Verify both directions                                 |
| F-12 | Tempo changes and whether they are stored with the score      | Playback bar          | `using/playback.md` | —     | Verify: temporary versus saved tempo must be exact     |
| F-13 | Compact playback menu on narrow screens                       | ≤ 600 px              | `using/playback.md` | S-47  | Overflow menu with loop, metronome, count-in, volume   |
| F-14 | Audio start latency and count-in recommendation               | Playback bar          | `using/playback.md` | —     | User-facing advice only                                |

## G. Printing and Export

| ID   | Feature                                                                 | UI location      | Destination                    | Image | Notes                                          |
| ---- | ----------------------------------------------------------------------- | ---------------- | ------------------------------ | ----- | ---------------------------------------------- |
| G-01 | Open the print preview, `Ctrl/Cmd+P` replaces the browser dialog        | Header           | `using/printing-and-export.md` | S-43  | Full-window preview                            |
| G-02 | Orientation `Portrait` / `Landscape`, A4                                | Preview controls | `using/printing-and-export.md` | S-44  | Fixed paper size                               |
| G-03 | Border margins per side, −5 to 50 mm in 5 mm steps                      | Preview controls | `using/printing-and-export.md` | S-44  | Negative values are a deliberate feature       |
| G-04 | Print scale 10–200 %, default 45 %                                      | Preview controls | `using/printing-and-export.md` | S-44  | Scale affects printing, not preview zoom       |
| G-05 | Track selection for printing and `Select All Tracks`                    | Preview controls | `using/printing-and-export.md` | S-44  | —                                              |
| G-06 | Measure widths in the preview, drag, `Reset widths`                     | Preview          | `using/printing-and-export.md` | S-33  | Staff view only                                |
| G-07 | Preview zoom 10–400 %, `Fit width`, `Fit page`, pager                   | Preview controls | `using/printing-and-export.md` | S-44  | Screen-only magnification                      |
| G-08 | `Print / PDF`, browser settings guidance, own title and page numbers    | Preview          | `using/printing-and-export.md` | S-45  | A4, 100 % scale, no browser headers or margins |
| G-09 | Warnings for oversized systems                                          | Preview          | `using/printing-and-export.md` | —     | Explain what to change                         |
| G-10 | MP3 export: entry, progress dialog, filename, settings, one-second tail | Header `Export`  | `using/printing-and-export.md` | S-46  | Loop excluded; mobile share sheet              |
| G-11 | Export limitations: browser encoder support, no range export            | —                | `using/printing-and-export.md` | —     | Verify current encoder fallback behaviour      |

## H. Instruments and Notation

| ID   | Feature                                                                       | Source                                  | Destination              | Image        | Notes                                                        |
| ---- | ----------------------------------------------------------------------------- | --------------------------------------- | ------------------------ | ------------ | ------------------------------------------------------------ |
| H-01 | Percussion clef and per-instrument staff lines                                | `StaffPrefixViewer`, `StaffRowGeometry` | `instruments.md`         | S-54a–S-54k  | Assumed knowledge: note values and rests                     |
| H-02 | Noteheads: oval, cross, square, triangle                                      | `NoteDisplayType`                       | `instruments.md`         | S-54a–S-54k  | Diamond exists in code but is used by no instrument          |
| H-03 | Articulations and their drawing: accent below, ghost parentheses, damped plus | `StaffNotation.headMarksOf`             | `instruments.md`         | S-24         | Keep one shared explanation instead of repeating per section |
| H-04 | Technique marks: rim shot cross, press-roll slashes, slap/open/heel circles   | `ScoreSymbols`, `StaffNoteViewer`       | `instruments.md`         | S-54e, S-54g | One shared explanation plus per-instrument availability      |
| H-05 | Dynamics marks and their playback effect                                      | `RangeArticulations`                    | `instruments.md`         | S-34         | Cross-link staff editing                                     |
| H-06 | Tuplet notation and labels above/below                                        | `StaffInk`, `SubdivisionToolbar`        | `using/staff-editing.md` | S-26         | Theory in the editing chapter, not per instrument            |
| H-07 | Agogô 2-Bell                                                                  | `bateria-instruments.ts` id 0           | `instruments.md`         | S-54a        | Two lines, low/high                                          |
| H-08 | Agogô 4-Bell                                                                  | id `"a"`                                | `instruments.md`         | S-54b        | Four lines, four bells; not in the default track set         |
| H-09 | Chocalho                                                                      | id 1                                    | `instruments.md`         | S-54c        | Triangle head, ghost variant                                 |
| H-10 | Tamborim                                                                      | id 2                                    | `instruments.md`         | S-54d        | Cross head, accent sample marked as built-in accent          |
| H-11 | Repinique                                                                     | id 3                                    | `instruments.md`         | S-54e        | Seven styles, stick and hand techniques                      |
| H-12 | Repinique (Whippy Sticks)                                                     | id 4                                    | `instruments.md`         | S-54f        | Not in the default track set                                 |
| H-13 | Caixa                                                                         | id 5                                    | `instruments.md`         | S-54g        | Press roll and rim shot                                      |
| H-14 | Timbau                                                                        | id 6                                    | `instruments.md`         | S-54h        | Square head, bass modelled as heel technique                 |
| H-15 | Surdo Terceira, Surdo Segunda, Surdo Primeira                                 | ids 7, 8, 9                             | `instruments.md`         | S-54i–S-54k  | Three sections, muted variant drawn with plus                |
| H-16 | Count-in voice ("Numbers", Portuguese)                                        | `support-sounds.ts`                     | `using/playback.md`      | —            | Not a selectable instrument                                  |
| H-17 | Instrument availability: New Song and Add Tracks only                         | `NewScoreDialog`, `TrackEditSidebar`    | `instruments.md`         | S-14         | No instrument administration exists                          |
| H-18 | Sound library is fixed and server-provided                                    | `public/sounds`, `soundLibPath`         | `instruments.md`         | —            | Operators can replace the folder; no UI                      |
| H-19 | Track color and icon per instrument                                           | `bateria-instruments.ts`                | `instruments.md`         | S-40         | Shared legend in the mixer                                   |
| H-20 | Default track set of a new score                                              | `Arrangement.emptyArrangement()`        | `using/score-library.md` | S-14         | Nine instruments; explain which two are absent               |

## I. Administration

| ID   | Feature                                                                             | Source                                           | Destination                                  | Image | Notes                                                        |
| ---- | ----------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------- | ----- | ------------------------------------------------------------ |
| I-01 | Requirements: Node.js version, database engines, operating systems                  | `package.json` engines, CI                       | `administration/installation.md`             | —     | Node `^24.15.0                                               |  | ^26.0.0`; fixes the stale README claim |
| I-02 | Deployment package: contents, layout, unpacking                                     | new `npm run package` (decision)                 | `administration/installation.md`             | —     | See `audit.md` → Deployment package                          |
| I-03 | Directory layout of an installation                                                 | backend, `dist/`, `public/`, `migrations/`, seed | `administration/installation.md`             | —     | Server serves `dist/` and `public/` itself                   |
| I-04 | Database preparation, empty database, privileges                                    | `build/migration.ts`                             | `administration/installation.md`             | —     | Database is created when missing                             |
| I-05 | Starting the backend, log output, port conflict                                     | `npm run start`                                  | `administration/installation.md`             | —     | Port in use exits with a message                             |
| I-06 | Reverse proxy, TLS termination, forwarded headers                                   | `trustProxy`, `allowedOrigins`                   | `administration/installation.md`             | —     | Refresh cookie is `Secure`; plain HTTP breaks refresh        |
| I-07 | First-run backend setup dialog (`Initialize Database`, `Reset Database`)            | `BackendSetupDialog`                             | `administration/installation.md`             | S-52  | Also a troubleshooting path                                  |
| I-08 | First-run installation wizard: admin user and initial group                         | `AdminSetupDialog`                               | `administration/installation.md`             | S-13  | Creates `Admins`, `World` and a default group                |
| I-09 | Every `backend-config.json` key with default and effect                             | `src/server/config.ts`                           | `administration/configuration.md`            | —     | Ten keys plus `JWT_SECRET`                                   |
| I-10 | Environment variables and precedence (env → file → default)                         | `src/server/config.ts`                           | `administration/configuration.md`            | —     | `HOST`, `PORT`, `DB_*`, `ALLOWED_ORIGINS`, `TRUST_PROXY`     |
| I-11 | `JWT_SECRET` requirement and rotation consequences                                  | `src/server/Auth.ts`                             | `administration/configuration.md`            | —     | Missing secret prevents startup; rotation logs everyone out  |
| I-12 | Sound library path and static serving of sounds                                     | `soundLibPath`, `/soundLib/`                     | `administration/configuration.md`            | —     | Escape attempts are rejected                                 |
| I-13 | CORS allowlist behaviour and its credential limitation                              | `Router.setCorsHeaders`                          | `administration/configuration.md`            | —     | No `Allow-Credentials`: refresh is same-origin only          |
| I-14 | Proxy trust and client address detection                                            | `RequestContext`                                 | `administration/configuration.md`            | —     | Affects rate-limit keys                                      |
| I-15 | Users: create, edit, reset password, admin membership, delete                       | `UserGroupEditor`                                | `administration/users-groups-permissions.md` | S-18  | Last-admin protection                                        |
| I-16 | Groups: create, edit, delete, group admin, members, filter                          | `UserGroupEditor`                                | `administration/users-groups-permissions.md` | S-19  | Group admins manage only their groups                        |
| I-17 | Group password and group login                                                      | Login dialog, groups tab                         | `administration/users-groups-permissions.md` | S-12  | Anonymous identity is reused; single refresh slot limitation |
| I-18 | Special groups `Admins` and `World`                                                 | `Auth`                                           | `administration/users-groups-permissions.md` | —     | `World` is read-only and cannot be removed from the system   |
| I-19 | Permission model: owner, read/write, inheritance, upgrade-only depth                | `Auth.checkPermission`                           | `administration/users-groups-permissions.md` | S-17  | Explain with an example folder tree                          |
| I-20 | `Group Access` editor usage and `Reset Children`                                    | `PermissionEditor`                               | `administration/users-groups-permissions.md` | S-17  | Owner is shown in the header                                 |
| I-21 | `Reset Backend` (database reset) and its consequences                               | User menu                                        | `administration/backup-restore-upgrades.md`  | —     | Deletes scores, folders, users, groups                       |
| I-22 | Brute-force limiting: 7 failures, 15-minute block, key                              | `RequestContext`                                 | `administration/security.md`                 | —     | In memory, per process                                       |
| I-23 | Token lifetimes, refresh cookie, one active refresh token per user                  | `Auth`                                           | `administration/security.md`                 | —     | HTTPS requirement; logout limitation                         |
| I-24 | Score locks: 30 minutes, token, force unlock is API-only                            | `ScoreRoutes`                                    | `administration/security.md`                 | —     | No heartbeat; limitation must be documented                  |
| I-25 | Static serving and SPA fallback                                                     | `StaticRoutes`                                   | `administration/configuration.md`            | —     | Cache headers for sounds                                     |
| I-26 | Database migrations: startup run, checksums, no down migrations                     | `build/migration.ts`                             | `administration/backup-restore-upgrades.md`  | —     | Modified migration requires dropping the database            |
| I-27 | Seeding and the anonymous system user                                               | `Router.seedIfExists`                            | `administration/backup-restore-upgrades.md`  | —     | Seed runs only into an empty database                        |
| I-28 | Backup and restore of database content                                              | —                                                | `administration/backup-restore-upgrades.md`  | —     | No tooling exists; give engine-level instructions            |
| I-29 | Upgrade between releases and between database engines                               | —                                                | `administration/backup-restore-upgrades.md`  | —     | No cross-engine migration path exists                        |
| I-30 | Not available: audit viewer, instrument admin, feature flags, self-service password | server routes                                    | `troubleshooting.md`                         | —     | State plainly so expectations are correct                    |
| I-31 | Health endpoint exposure                                                            | `?action=health`                                 | `administration/security.md`                 | —     | Returns engine, host, port and database name                 |

## J. Reference and Troubleshooting

| ID   | Feature                                                                                                     | Destination                       | Image | Notes                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------- | --------------------------------- | ----- | ------------------------------------------------------ |
| J-01 | Global shortcuts (`Ctrl/Cmd+S`, `P`, `C`, `X`, `V`, `Z`, `Shift+Z`, `Y`, `G`, `S`, Escape)                  | `reference/keyboard-shortcuts.md` | —     | Grouped by scope                                       |
| J-02 | Score input shortcuts (`1`–`9`, `0`, `Alt/Cmd+1`–`6`, `Alt/Cmd+.`, `I`, `O`, arrows, `Delete`, `Backspace`) | `reference/keyboard-shortcuts.md` | —     | Per view                                               |
| J-03 | Selection modifiers and Escape during drag                                                                  | `reference/keyboard-shortcuts.md` | —     | —                                                      |
| J-04 | Dialog and menu keys (`Enter`, arrows, `Home`/`End`)                                                        | `reference/keyboard-shortcuts.md` | —     | Brief                                                  |
| J-05 | Glossary of UI and music terms                                                                              | `reference/glossary.md`           | —     | Uses the agreed terminology                            |
| J-06 | Server unreachable at startup                                                                               | `troubleshooting.md`              | S-52  | —                                                      |
| J-07 | Connection lost during a session                                                                            | `troubleshooting.md`              | S-50  | —                                                      |
| J-08 | Login failures, wrong group password, lockout                                                               | `troubleshooting.md`              | S-11  | Do not reveal whether a user exists beyond the UI text |
| J-09 | Permission denied and read-only library entries                                                             | `troubleshooting.md`              | —     | Also administration chapter                            |
| J-10 | Score locked by another user, expired session                                                               | `troubleshooting.md`              | —     | Server restart clears in-memory rate limits, not locks |
| J-11 | Missing sounds, fonts or uploaded files                                                                     | `troubleshooting.md`              | —     | Check `public/`, `soundLibPath`, build outputs         |
| J-12 | MP3 export fails or stays silent                                                                            | `troubleshooting.md`              | —     | Browser encoder support, muted tracks                  |
| J-13 | Print result differs from preview                                                                           | `troubleshooting.md`              | —     | Browser settings, scale, margins                       |
| J-14 | Migration checksum error after an update                                                                    | `troubleshooting.md`              | —     | Branch database hint                                   |
| J-15 | Database and setup problems (`Initialize Database`, `Reset Database`)                                       | `troubleshooting.md`              | S-52  | Backend setup dialog                                   |
| J-16 | Settings and session selection lost                                                                         | `troubleshooting.md`              | —     | Browser storage is local; no server copy               |
| J-17 | Known limitations list (product, security, operations)                                                      | `troubleshooting.md`              | —     | Kept in sync with `audit.md` during the release        |

## K. Development

| ID   | Feature                                                  | Source                                      | Destination                    | Notes                                             |
| ---- | -------------------------------------------------------- | ------------------------------------------- | ------------------------------ | ------------------------------------------------- |
| K-01 | Node and npm requirements                                | `engines`, `.nvmrc`, CI                     | `development/setup.md`         | Matches installation chapter                      |
| K-02 | Clone, install, configure, start                         | `package.json`                              | `development/setup.md`         | `npm ci` in CI                                    |
| K-03 | Development secret and `start-debug`                     | `package.json`                              | `development/setup.md`         | Replaces the stale `start-with-dummy-secret`      |
| K-04 | Vite dev server over HTTPS and API proxy                 | `vite.config.ts`                            | `development/setup.md`         | `https://localhost:5173`                          |
| K-05 | Command table: check, lint, test, test:e2e, build, start | `package.json`                              | `development/setup.md`         | Exact commands only                               |
| K-06 | Test layout: unit, UI, player, server, integration, e2e  | `tests/`                                    | `development/setup.md`         | Link `test-organization` knowledge only if public |
| K-07 | Migrations and branch-specific databases                 | `build/migration.ts`                        | `development/setup.md`         | `db:cleanup` for stale branches                   |
| K-08 | SMuFL metric generation and font verification            | `build/generate-smufl-metrics.ts`, verifier | `development/architecture.md`  | Verification fails the build on broken fonts      |
| K-09 | Theme generation from VS Code themes                     | `build/generate-daisyui-themes.ts`          | `development/architecture.md`  | Output in `src/generated/`                        |
| K-10 | Bundle budget and build output contract                  | `build/BundleBudget.ts`                     | `development/architecture.md`  | Link, do not copy                                 |
| K-11 | Architecture map and ADR links                           | `docs/adr/`, `docs/design/`                 | `development/architecture.md`  | `score-navigation.md` is an unimplemented draft   |
| K-12 | VS Code debugging configuration                          | `.vscode/launch.json`                       | `development/setup.md`         | One paragraph                                     |
| K-13 | Documentation maintenance and website handoff            | `docs/planning/handbook-2.0/`               | `development/documentation.md` | Phase 7 records the procedure                     |

## Items Explicitly Excluded from the Handbook

| Item                                                                  | Reason                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Instrument administration, instrument image upload                    | No reachable UI; upload endpoint does not match the migrated schema |
| Feature flags (`features` table, `EntityType.Feature`)                | No UI, no reads, admin-only placeholder                             |
| Audit log viewer                                                      | Does not exist; `login_audit` is write-only                         |
| Tags, favourites, virtual folders (`docs/design/score-navigation.md`) | Design draft, not implemented                                       |
| Force unlock, `clearAll`                                              | API-only, no UI                                                     |
| Recording or live input                                               | Not implemented                                                     |
| `Diamond` notehead, unused hand and stick techniques                  | Not used by any instrument                                          |
| Onboarding tutorial (disabled for 2.0.0)                              | Reclassified to issue #63                                           |
| Roadmap and demo-access implementation                                | Separate application task                                           |
