# Your First Session

This chapter takes you from the sign-in dialog to a score that plays and saves.

## Reaching the Application

Open the address your administrator gave you, for example `https://scores.example.org/`. The backend serves the application, the music fonts, and the sound samples from the same address, so nothing else has to be installed.

During development the frontend runs separately at `https://localhost:5173`; [Development Setup](../development/setup.md) describes that setup.

On a fresh installation the application asks for the database connection first and then for the first administrator account, before the `Sign In` dialog appears. [Installing Animada Score Book](../administration/installation.md) walks through both.

If the backend cannot be reached, the application shows a connection dialog with a retry counter instead of the score. [Troubleshooting and Known Limitations](../troubleshooting.md) explains what to check.

## Signing In

The `Sign In` dialog has two tabs and up to two actions:

- **User** takes a `Username` and a `Password` for a personal account.
- **Group** takes a group from a dropdown and that group's password. Use it when several people share one login.
- **`Log In`** confirms either form.
- **`Continue Anonymously`** is offered while no user is required. Anonymous visitors can browse and play publicly
  readable scores.

Your session stays open while you work, and the backend renews it in the background. This renewal uses a secure cookie, which is why the installation has to be reachable over HTTPS; see [Security Notes](../administration/security.md).

To end the session, open the user menu in the header and choose `Sign Out`.

## Opening a Score

1. Press the `Score Library` button in the header. The library opens as a drawer over the score area.
2. Open a folder and choose a score. The row menu offers `Load Score`, `Copy Score URL`, `Remove Score`, and `Group
   Access`.
3. The header shows the path (`Score Library › <title>`) together with the score's name and performance statistics.

A shared link opens the same score directly. Such links look like `https://<host>/?score=<id>`, and both the direct link and the library need read access to the score.

## Playing the Score

The playback bar controls the transport:

- Play and stop, from the round button at its left end.
- Tempo in BPM, using `-` and `+`. A star next to the value means the playback tempo differs from the tempo stored in
  the score; enter edit mode to keep the change.
- `Loop playback`, `Metronome`, `Count-in`, and the master volume. Narrow layouts fold these into the `More playback
  controls` menu.

The [Playback and Practice](../using/playback.md) chapter covers the mixer, Play Focus, and the playhead.

## Switching between Grid and Staff View

The mode bar near the score switches its presentation:

- `Grid` shows the note grid, tooltip `Show the score as a note grid (G)`.
- `Staff` shows the staff notation, tooltip `Show the score as staff notation (S)`.

Pressing `G` or `S` does the same, as long as the focus is not in a text field. The chosen view is remembered in your browser and is restored the next time you open the application.

## Zoom and Zen Mode

The footer holds the zoom buttons and the Zen mode toggle:

- `Zoom out` and `Zoom in` change the track viewer zoom in 10 % steps between 50 % and 150 %. The same value is
  available as `Track viewer zoom` in the settings, together with a `Reset` button.
- `Enter Zen mode` hides the surrounding controls so that only the score remains, and the same button then reads `Exit
  Zen mode`. The [Reading a Score](../using/presentation.md) chapter describes what else changes.

## Saving Your Work

A badge next to the score title tells you where the score stands:

| Badge             | Meaning                                                  |
| ----------------- | -------------------------------------------------------- |
| `Unchanged`       | The score was loaded and has not been edited since.      |
| `Unsaved changes` | The score differs from the version stored on the server. |
| `Saved`           | The score was saved during this session.                 |

`Save Score` in the header writes the score to the backend and is enabled while there are unsaved changes. In edit mode, `Ctrl+S` or `Cmd+S` does the same. Leaving edit mode saves first and keeps you in edit mode if the save fails.

Two independent things happen here:

- **The browser keeps a copy** of the score you are working on, so a reload does not discard your work.
- **The server keeps the score** only after a save, and only if you have write access to it. A save without write access
  fails, and the application reports it.

If you try to leave the page with unsaved changes, the application asks whether to save them first.

## Where the Controls Are

| Area         | Contents                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Header       | `Score Library`, `New Score`, `Edit Mode`, `Print`, `Export`, `Save Score`, undo and redo, `Settings`, user menu |
| Playback bar | Play and stop, tempo, loop, metronome, count-in, master volume                                                   |
| Mode bar     | `Grid` and `Staff`                                                                                               |
| Footer       | Bar navigator (`Bar 5 of 32`), zoom, Zen mode, version button with the release notes, notification center        |

## Next Steps

- [The Score Library](../using/score-library.md) explains folders, new scores, imports, and sharing.
- [Reading a Score](../using/presentation.md) explains the two views, music fonts, and themes.
- [Editing in the Staff View](../using/staff-editing.md) starts with note entry.
