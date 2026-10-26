# Animada Score Book Handbook

Animada Score Book is a browser-based score library and playback application for Samba groups. It stores your
repertoire, shows each score as a note grid or as staff notation, plays it back with per-track mixing, and prints or
exports it. This handbook documents version 2.0.0.

Choose the path that matches your role:

| Audience       | Start here                                                      |
| -------------- | --------------------------------------------------------------- |
| Musicians      | [Your First Session](getting-started/first-steps.md)            |
| Administrators | [Installing Animada Score Book](administration/installation.md) |
| Developers     | [Development Setup](development/setup.md)                       |

## Getting Started

| Chapter                                                   | Contents                                                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [What Animada Score Book Is](getting-started/overview.md) | The product idea, the terms used throughout the handbook, browser and device requirements, and what demo access can and cannot do |
| [Your First Session](getting-started/first-steps.md)      | Signing in, opening a score, playback, switching views, zoom, Zen mode, saving, and where the settings are                        |

## Using the Application

| Chapter                                                      | Contents                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| [The Score Library](using/score-library.md)                  | Browsing the library tree, creating folders and scores, importing, opening, sharing, and permissions                                  |
| [Reading a Score](using/presentation.md)                     | Grid view and staff view, music fonts, color themes, zoom, the score navigator, Zen mode, phones and tablets, the notification center |
| [Editing in the Staff View](using/staff-editing.md)          | Note entry, note values, rests, note styles, articulations, subdivisions and tuplets, selection, clipboard, undo and redo             |
| [Editing in the Grid View](using/grid-editing.md)            | The raster model, note entry, note styles, selections, and the differences from staff editing                                         |
| [Playback and Practice](using/playback.md)                   | Transport, tempo, mixer, metronome, count-in, Play Focus, looping, the playhead, and note preview                                     |
| [Printing, PDF and MP3 Export](using/printing-and-export.md) | The print preview, layout controls, browser PDF output, and MP3 export                                                                |

## Instrument and Notation Reference

| Chapter                                             | Contents                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [Instrument and Notation Reference](instruments.md) | Notation basics plus one section per instrument type: note styles, staff placement, articulations |

## Administration

| Chapter                                                                     | Contents                                                                                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [Installing Animada Score Book](administration/installation.md)             | Requirements, deployment package, database preparation, first start, HTTPS, and upgrades |
| [Configuring the Backend](administration/configuration.md)                  | Every configuration key and environment variable with its default and effect             |
| [Users, Groups and Permissions](administration/users-groups-permissions.md) | Accounts, groups, group login, ownership, read/write access, and the Group Access editor |
| [Security Notes](administration/security.md)                                | Password storage, sessions, brute-force limiting, score locks, and a hardening checklist |
| [Backup, Restore and Upgrades](administration/backup-restore-upgrades.md)   | What lives where, backup and restore procedures, migrations, and upgrades                |

## Reference

| Chapter                                                     | Contents                                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Keyboard Shortcuts](reference/keyboard-shortcuts.md)       | Global shortcuts, score input keys, selection modifiers, and dialog keys    |
| [Glossary](reference/glossary.md)                           | Application terms, music terms, and their German and Portuguese equivalents |
| [Troubleshooting and Known Limitations](troubleshooting.md) | Common problems with their cause, and the limitations documented for 2.0.0  |

## Development

| Chapter                                                        | Contents                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [Development Setup](development/setup.md)                      | Requirements, configuration, development server, backend start, test commands, and debugging     |
| [Architecture and Decisions](development/architecture.md)      | A short map of the codebase with links to the architecture decisions and design contracts        |
| [Maintaining This Documentation](development/documentation.md) | Page and image conventions, the handbook/website handoff, and what must change with each release |

## Related Documents

- [README](../../readme.md) — product overview, installation entry point, and links to this handbook
- [Release notes](../../release-notes.md) — what changed in each released version
- [Architecture decision records](../adr/readme.md) — the durable decisions behind the implementation
- [License](../../License.txt)

## Editions and Languages

The English handbook in this directory is the authoritative edition. Sibling language directories are reserved for
future translations and are created only when a translation exists. A published HTML edition is planned in a separate
website project; until then, these Markdown pages are the reference.
