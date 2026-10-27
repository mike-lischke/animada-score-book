# Instrument and Notation Reference

Animada Score Book ships eleven instrument types, each with its own set of note styles, symbols, and sounds. This page explains how each of them is written and how it sounds.

Every section follows the same order: what the instrument is, how it sits on the staff, which note styles the track offers, which articulations you can add, and what playback does with them. [Editing in the Staff View](using/staff-editing.md) explains how to create these marks.

## Notation Basics

These rules apply to all instruments:

- Each track row starts with a percussion clef.
- Agogô 2-Bell is written on two staff lines, Agogô 4-Bell on four, and every other instrument on a single line.
- Note values from whole to thirty-second, dotted values, and rests behave as in any other notation. They are assumed knowledge; the [Glossary](reference/glossary.md) lists their names.
- A **note style** decides the sound and the symbol of a note. In the grid view a style appears as an icon in the cell; on the staff it appears as a notehead shape plus, for some techniques, a mark next to the note.
- An **articulation** changes how a note of a given style is struck: `Accent` draws an accent below the note, `Ghost` puts the note in parentheses, and `Damped` adds a plus sign.
- **Dynamics** (`Crescendo`, `Decrescendo`, `Forte`) span several bars and change the playback volume.
- The track color and its instrument icon identify a track in the mixer and on the staff, so several instruments stay distinguishable.

Articulations exist only where an instrument provides a matching variant of the same stroke: the toolbar offers accent, damped, or ghost only when the instrument's styles include that variant. Where a style is already recorded with an accent, the note sounds accented without an articulation mark.

## Agogô 2-Bell

The double bell, struck with a stick. It marks the pattern in many Samba styles.

**Staff:** two lines. The lower bell sits on the second line, the higher bell on the first.

| Note style | Marker                       | Meaning                     |
| ---------- | ---------------------------- | --------------------------- |
| `Low`      | Down arrow, lower staff line | The lower of the two bells  |
| `High`     | Up arrow, upper staff line   | The higher of the two bells |

**Articulations:** none. The two styles are different bells rather than variants of one stroke, so there is nothing to accent or dampen.

**Playback:** each style plays its own recorded bell.

## Agogô 4-Bell

The four-bell agogô, used where a pattern needs more pitches.

**Staff:** four lines, one per bell, from lowest to highest.

| Note style | Marker                   | Meaning                     |
| ---------- | ------------------------ | --------------------------- |
| `Lowest`   | Down arrow with a bar    | Lowest bell, bottom line    |
| `Lower`    | Half arrow pointing down | Second lowest, third line   |
| `Higher`   | Half arrow pointing up   | Second highest, second line |
| `Highest`  | Up arrow with a bar      | Highest bell, top line      |

**Articulations:** none, for the same reason as on the two-bell agogô.

**Playback:** each style plays its own bell.

## Chocalho

The shaker, played with a shaking motion rather than a stroke.

**Staff:** one line. The notehead is a triangle.

| Note style | Marker                  | Meaning       |
| ---------- | ----------------------- | ------------- |
| `Chocalho` | Triangle notehead       | Regular shake |
| `Ghost`    | Triangle in parentheses | Light shake   |

**Articulations:** `Ghost`. The light variant is the only articulation the instrument provides.

**Playback:** the excitation is a shake, so the two styles differ in level rather than in the striking technique.

## Tamborim

The small frame drum, played with a stick.

**Staff:** one line. The notehead is a cross.

| Note style | Marker          | Meaning                            |
| ---------- | --------------- | ---------------------------------- |
| `Accent`   | Full-size cross | Accented stroke                    |
| `Ghost`    | Small cross     | Light stroke, drawn in parentheses |

**Articulations:** `Accent` and `Ghost`. The accented style already sounds accented.

**Playback:** both styles are single strokes on the same skin; they differ only in level.

## Repinique

The lead drum of the bateria, played with a stick and with the hand.

**Staff:** one line. The stick strokes mostly use an oval notehead; `Rim` uses a cross, and the two hand strokes use a square.

| Note style   | Marker              | Meaning                                |
| ------------ | ------------------- | -------------------------------------- |
| `Center`     | Full-size cross     | Stroke on the centre of the head       |
| `Outer Area` | Small cross         | Stroke near the rim area               |
| `Rimshot`    | Rays above the note | Stick on rim and head at the same time |
| `Rim`        | Rim arc, cross head | Stick on the rim only                  |
| `Buzz`       | Three slashes       | Pressed roll with a buzzing sound      |
| `Open`       | Circle, square head | Open hand stroke                       |
| `Slap`       | Rays, square head   | Slap with the hand                     |

**Articulations:** `Accent`, on the centre stroke. The rim, buzz, and hand techniques have no accent variant, so the button is unavailable while one of them is selected.

**Playback:** `Center` and `Slap` already sound accented; the other styles are plain strokes.

## Repinique (Whippy Sticks)

The same drum played with flexible whippy sticks, which gives a lighter, higher sound.

**Staff:** one line, oval noteheads.

| Note style | Marker          | Meaning                            |
| ---------- | --------------- | ---------------------------------- |
| `Normal`   | Full-size cross | Normal stroke with whippy sticks   |
| `Ghost`    | Small cross     | Light stroke, drawn in parentheses |

**Articulations:** `Accent` and `Ghost`.

**Playback:** the normal stroke already sounds accented, so quiet passages need the ghost style.

## Caixa

The snare drum of the bateria, played with two sticks.

**Staff:** one line, oval noteheads.

| Note style   | Marker              | Meaning                                |
| ------------ | ------------------- | -------------------------------------- |
| `Normal`     | Full-size cross     | Normal stroke                          |
| `Ghost`      | Small cross         | Light stroke, drawn in parentheses     |
| `Press Roll` | Three slashes       | Pressed roll                           |
| `Rimshot`    | Rays above the note | Stick on rim and head at the same time |

**Articulations:** `Accent` and `Ghost`.

**Playback:** the normal stroke already sounds accented; ghost notes, the press roll, and the rimshot have their own sounds.

## Timbau

The hand drum, played with open, slap, and bass strokes.

**Staff:** one line, square noteheads.

| Note style | Marker        | Meaning                               |
| ---------- | ------------- | ------------------------------------- |
| `Open`     | Open circle   | Open hand stroke                      |
| `Slap`     | Rays          | Slap with the hand                    |
| `Bass`     | Closed circle | Bass stroke with the heel of the hand |

**Articulations:** none. The three styles are different hand techniques rather than variants of one stroke.

**Playback:** the slap already sounds accented; open and bass strokes are plain.

## Surdo Terceira

The smallest and highest of the three surdos.

**Staff:** one line, oval noteheads.

| Note style | Marker        | Meaning                                  |
| ---------- | ------------- | ---------------------------------------- |
| `Center`   | Open circle   | Open stroke                              |
| `Muted`    | Closed circle | Stroke with the hand resting on the head |

**Articulations:** `Damped`, which is the same sound as the muted style and is offered for notes that use the open style.

**Playback:** the muted stroke is shorter and duller; the two styles are otherwise identical.

## Surdo Segunda

The middle surdo, between the terceira and the primeira.

**Staff:** one line, oval noteheads.

| Note style | Marker        | Meaning                                  |
| ---------- | ------------- | ---------------------------------------- |
| `Center`   | Open circle   | Open stroke                              |
| `Muted`    | Closed circle | Stroke with the hand resting on the head |

**Articulations:** `Damped`, as on the terceira.

**Playback:** same behaviour as the terceira, with the deeper sound.

## Surdo Primeira

The largest and lowest surdo, which carries the pulse of the bateria.

**Staff:** one line, oval noteheads.

| Note style | Marker        | Meaning                                  |
| ---------- | ------------- | ---------------------------------------- |
| `Center`   | Open circle   | Open stroke                              |
| `Muted`    | Closed circle | Stroke with the hand resting on the head |

**Articulations:** `Damped`, as on the other two surdos.

**Playback:** the deepest of the three surdos.

## Related Chapters

- [Editing in the Staff View](using/staff-editing.md) explains note styles, articulations, and dynamics in practice.
- [Playback and Practice](using/playback.md) explains the mixer and how single notes are previewed.
- [Glossary](reference/glossary.md) defines the music terms used here.
