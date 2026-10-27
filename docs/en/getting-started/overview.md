# What Animada Score Book Is

Animada Score Book keeps a Samba group's repertoire in one place and makes it playable. It is a browser application with a small backend: the backend stores scores, users, and permissions in a database, and the browser renders, plays, and edits them.

Everything in the application is built around a bateria. A score is a rhythmic arrangement for several percussion instruments, written so that a player can follow it on screen, change it, and hear the result played back in the browser.

## What You Can Do

| Task                                                               | Chapter                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Browse and organize scores in a library                            | [The Score Library](../using/score-library.md)                                 |
| Read a score as a note grid or as staff notation                   | [Reading a Score](../using/presentation.md)                                    |
| Play back with metronome, count-in, mixer, and Play Focus          | [Playback and Practice](../using/playback.md)                                  |
| Edit notes, note styles, articulations, subdivisions, and dynamics | [Editing in the Staff View](../using/staff-editing.md)                         |
| Print a score or save it as PDF                                    | [Printing, PDF and MP3 Export](../using/printing-and-export.md)                |
| Export the playback as an MP3 file                                 | [Printing, PDF and MP3 Export](../using/printing-and-export.md)                |
| Administer users, groups, and access                               | [Users, Groups and Permissions](../administration/users-groups-permissions.md) |

## The Building Blocks

The handbook uses these terms throughout. The [Glossary](../reference/glossary.md) defines each of them.

| Term             | Meaning                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| **score**        | One piece of music: its title, meter, tempo, bars, and tracks                                                      |
| **track**        | One row of the score, played by one instrument                                                                     |
| **bar**          | One column of the score; bars are counted from 1                                                                   |
| **instrument**   | A percussion instrument with a fixed set of note styles, samples, and symbols                                      |
| **note style**   | A playable variant of an instrument, such as `Open`, `Muted`, or `Slap`, deciding sound and symbol together        |
| **articulation** | A mark added to a note, such as `Accent`, `Ghost`, or `Damped`, that does not change the instrument's sound choice |
| **dynamics**     | Volume marks that span bars: crescendo, decrescendo, and forte                                                     |
| **subdivision**  | A division of a bar position into a tuplet, for example a triplet                                                  |

A score is created through the `New Song` dialog with a title, a time signature, a number of bars, a tempo in BPM, and the instruments that get a track. The available time signatures are 4/4, 6/8, 5/4, and 7/8.

Eleven instrument types are available, from Agogô 2-Bell to the three surdos. [Instrument and Notation Reference](../instruments.md) explains each of them.

## Two Views of the Same Score

Every score has two presentations:

- The **grid view** shows the score as a matrix of bars and tracks. Each cell carries one symbol, which makes the
  rhythmic pattern easy to read and quick to enter.
- The **staff view** shows the score as percussion notation with a clef, time signature, stems, beams, and tuplets. It
  is what most players read and what the print output contains.

Both views show the same data and both can be edited. You can switch at any time, including during playback, and the position in the score is kept. [Reading a Score](../using/presentation.md) explains when each view helps.

## Where Your Data Lives

Animada Score Book has two storage locations, and the difference matters when you work with a score:

- **The backend and its database** hold the score library, the user accounts, the groups, and the permissions. The same
  process also serves the application itself, including the music fonts and the sound samples.
- **Your browser** holds the current score and your personal settings, such as the chosen view, music font, color theme,
  and zoom. An open score survives a reload because of this copy, but it is not the server copy and it is not available
  on another device.

Saving a score through `Save Score` writes it to the backend, which requires write access to that score. Without write access you can still read and play the score, and your local copy keeps your own changes without publishing them.

Hosting follows from this split: an administrator installs the backend once, and everyone else only needs a browser and the address of that installation. In development the backend and the frontend run as two processes instead; see [Development Setup](../development/setup.md).

## Requirements

| Area    | Requirement                                                                                                                            |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Browser | A current browser with Web Audio, `localStorage`, and ES module support. The test suite uses Chromium.                                 |
| MP3     | MP3 export additionally needs the browser's MP3 encoding support; it is tested in Chromium.                                            |
| Screen  | Desktop, tablet, and phone layouts are supported. Zoom is manual, from 50 % to 150 %.                                                  |
| Network | The browser must reach the backend. HTTPS is required for sessions to refresh, see [Security Notes](../administration/security.md).    |
| Server  | Node.js and MySQL/MariaDB or PostgreSQL, installed as described in [Installing Animada Score Book](../administration/installation.md). |

## Anonymous Access

The `Sign In` dialog offers `Continue Anonymously` next to `Log In`. Anonymous visitors can browse and play every publicly readable score, and the application keeps their local changes in the browser. They cannot publish changes to scores they do not own.

## Where to Go Next

- New to the application? Continue with [Your First Session](first-steps.md).
- Looking for how a specific instrument is written? See [Instrument and Notation Reference](../instruments.md).
- Setting up a server? Start with [Installing Animada Score Book](../administration/installation.md).
