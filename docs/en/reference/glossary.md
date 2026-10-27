# Glossary

The handbook uses the labels the application shows. This page collects them and the music terms the other chapters rely on.

Instrument names stay as the instruments are called in a bateria; [Instrument and Notation Reference](../instruments.md) explains each of them in detail.

## Application Terms

| Term                        | Meaning                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Score Library**           | The drawer that holds every score a user can reach, organized in folders                               |
| **score**                   | One piece of music with its title, meter, tempo, bars, and tracks                                      |
| **track**                   | One row of the score, played by a single instrument                                                    |
| **bar**                     | One column of the score; bars are counted from 1                                                       |
| **grid view**               | The presentation as a matrix of bars and tracks, one symbol per step                                   |
| **staff view**              | The presentation as percussion notation                                                                |
| **edit mode**               | The state in which the score can be changed; the header switch reads `Editing` while it is active      |
| **note style**              | A playable variant of an instrument, such as `Center`, `Ghost`, or `Slap`; it decides sound and symbol |
| **playing technique**       | How the instrument is struck, for example with a stick, a hand, or the heel of the hand                |
| **articulation**            | A mark added to a note — `Accent`, `Ghost`, or `Damped` — without changing its note style              |
| **dynamics**                | Volume marks over a span of bars: `Crescendo`, `Decrescendo`, `Forte`                                  |
| **subdivision**             | A part of a bar divided into a tuplet                                                                  |
| **tuplet**                  | A group of notes that divides a duration into a number other than its natural one                      |
| **one-bar repeat (simile)** | A mark that stands for the previous bar of the same track                                              |
| **Play Focus**              | The bars playback is limited to; no focused bar means the whole score                                  |
| **mixer**                   | The volume column next to the track names                                                              |
| **focus**                   | A track level above 100 % that boosts one track and attenuates the others                              |
| **mute**                    | A track level of 0 %                                                                                   |
| **Zen mode**                | The reduced layout that hides the header and the mode bar around the score                             |
| **Settings**                | The dialog with music font, color theme, zoom, and the other display options                           |
| **music font**              | The SMuFL font that draws notes, rests, clefs, and barlines                                            |
| **color theme**             | The palette of the interface                                                                           |
| **score navigator**         | The strip in the footer that shows and moves the visible range                                         |
| **notification center**     | The message history behind the bell button in the footer                                               |
| **Group Access**            | The editor that grants read and write access to a folder or score                                      |
| **read** / **write**        | The two permission levels; `write` always includes `read`                                              |
| **Admins**                  | The group whose members may administer the installation                                                |
| **World**                   | The group every user and every anonymous visitor belongs to                                            |
| **backend**                 | The Node.js process with the database that serves the application                                      |
| **database**                | MySQL/MariaDB or PostgreSQL, holding library, accounts, and permissions                                |
| **deployment package**      | The archive an administrator unpacks and starts with `node server.js`                                  |

## Music Terms

| Term                   | Meaning                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| **percussion clef**    | The clef at the start of a percussion staff                         |
| **time signature**     | The meter of a score; the application offers 4/4, 6/8, 5/4, and 7/8 |
| **tempo**              | Speed in beats per minute (BPM)                                     |
| **whole note**         | A note lasting a whole bar in 4/4                                   |
| **half note**          | Half of a whole note                                                |
| **quarter note**       | A quarter of a whole note; the beat in 4/4                          |
| **eighth note**        | Half of a quarter note                                              |
| **sixteenth note**     | Half of an eighth note                                              |
| **thirty-second note** | Half of a sixteenth note; the shortest value the application offers |
| **dotted note**        | A note extended by half of its own value                            |
| **rest**               | A silence with a note value of its own                              |
| **whole-bar rest**     | A rest that fills a bar without content                             |
| **stem**               | The vertical line attached to a notehead                            |
| **beam**               | The line that joins several short notes into one group              |
| **flag**               | The stroke on the stem of a single short note                       |
| **duplet**             | A tuplet that plays two notes in the time of three                  |
| **triplet**            | A tuplet that plays three notes in the time of two                  |
| **quadruplet**         | A tuplet that plays four notes in the time of three                 |
| **quintuplet**         | A tuplet that plays five notes in the time of four                  |
| **sextuplet**          | A tuplet that plays six notes in the time of four                   |
| **septuplet**          | A tuplet that plays seven notes in the time of four                 |
| **octuplet**           | A tuplet that plays eight notes in the time of six                  |
| **nontuplet**          | A tuplet that plays nine notes in the time of eight                 |
| **accent**             | A mark that makes a note sound stronger                             |
| **ghost note**         | A light stroke, written in parentheses                              |
| **damped**             | A stroke with the sound stopped by the hand                         |
| **crescendo**          | A gradual increase in volume                                        |
| **decrescendo**        | A gradual decrease in volume                                        |
| **forte**              | A sudden loud level                                                 |
| **repeat barlines**    | A pair of barlines that makes playback repeat the bars between them |
| **simile**             | The sign that stands for the previous bar                           |

## Samba Practice

| Term                          | Meaning                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------ |
| **bateria**                   | The percussion section of a Samba group, and the group of instruments it plays |
| **Agogô 2-Bell**              | The double bell, struck with a stick; written on two staff lines               |
| **Agogô 4-Bell**              | The four-bell agogô, written on four staff lines                               |
| **Chocalho**                  | The shaker, played with a shaking motion                                       |
| **Tamborim**                  | The small frame drum, played with a stick                                      |
| **Repinique**                 | The lead drum, played with a stick and with the hand                           |
| **Repinique (Whippy Sticks)** | The same drum played with flexible whippy sticks                               |
| **Caixa**                     | The snare drum                                                                 |
| **Timbau**                    | The hand drum, played with open, slap, and bass strokes                        |
| **Surdo Terceira**            | The highest of the three surdos                                                |
| **Surdo Segunda**             | The middle surdo                                                               |
| **Surdo Primeira**            | The lowest surdo, which carries the pulse                                      |

## Related Chapters

- [What Animada Score Book Is](../getting-started/overview.md) introduces the terms in context.
- [Instrument and Notation Reference](../instruments.md) describes every instrument and its note styles.
