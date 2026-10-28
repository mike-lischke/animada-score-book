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

Articulations exist only where an instrument provides a matching variant of the same stroke: the toolbar offers accent, damped, or ghost only when the instrument's styles include that variant. Where a style is already recorded with an accent or a muted sound, the note carries the matching mark on its own, and the articulation toolbar shows that button as pressed while such a note is selected.

![Accent, damped, and ghost marks on a staff](../images/notation/articulations.png)

*Accents below the noteheads, the damped plus above one, and the ghost note in parentheses.*

![A forte mark and a crescendo hairpin](../images/notation/dynamics.png)

*`Forte` before the group and a `Crescendo` hairpin below it; the blue dots are its drag handles.*

## The Note Heads

Every symbol in the score is built from a small set of note heads. A head says *how* the sound is produced, not *which* instrument produces it, so the same head appears across instruments: the square stands for a stroke with the hand, as on the Repinique, the Timbau, or the free hand of a Surdo, and the oval for any stroke that rings.

| Head                                                                           | Name             | Meaning                                                                     |
| ------------------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------- |
| ![A filled oval note head](../images/notation/head-oval.png)                   | `Oval`           | A stroke that sounds: a hit on a drum head, a bell, or a cuíca              |
| ![A cross note head on a stem](../images/notation/head-cross.png)              | `Cross`          | An unpitched stroke of any kind, such as a hit on the rim                   |
| ![A filled square note head](../images/notation/head-square.png)               | `Square`         | A stroke with the hand, as on a Repinique, a Timbau, or a Surdo             |
| ![A filled triangle note head](../images/notation/head-triangle.png)           | `Triangle`       | A shaken instrument, such as a Chocalho or a Ganzá                          |
| ![An oval note head with a cross over it](../images/notation/head-rimshot.png) | `Oval` + `Cross` | A stick on rim and head at once: the oval head with the cross drawn over it |

A few rules follow from that:

- A head is never tied to one instrument. Which head a style uses is part of the instrument definition and can be seen in the notation of each instrument below.
- Marks such as accent, ghost, the damped plus, the cross of a slap, or the strokes of a press roll are drawn *in addition to* the head, so a symbol can consist of two base elements.
- The cross alone already says *unpitched*. A short line placed under the head — as the Repinique's `Rim` uses — says *where* the stroke lands, so the line is a position mark, not part of the head.
- `Diamond` is reserved for special sounds such as bells; none of the bundled instruments uses it today, so it does not appear in the images on this page.
- Two places a stroke can land carry no mark yet: the shell of the drum and its tension rods. No instrument on this page uses them.

## Agogô 2-Bell

The double bell, struck with a stick. It marks the pattern in many Samba styles.

**Staff:** two lines. The lower bell sits on the second line, the higher bell on the first.

![Agogô 2-Bell notation: a low bell note followed by a high bell note](../images/notation/agogo-2-bell.png)

*The two bell styles in notation: `Low`, then `High`.*

| Note style | Symbol           | Meaning                     |
| ---------- | ---------------- | --------------------------- |
| `Low`      | Oval, lower line | The lower of the two bells  |
| `High`     | Oval, upper line | The higher of the two bells |

**Articulations:** none. The two styles are different bells rather than variants of one stroke, so there is nothing to accent or dampen.

**Playback:** each style plays its own recorded bell.

## Agogô 4-Bell

The four-bell agogô, used where a pattern needs more pitches.

**Staff:** four lines, one per bell, from lowest to highest.

![Agogô 4-Bell notation: four notes rising from the lowest to the highest bell](../images/notation/agogo-4-bell.png)

*One note per bell, bottom line to top line: `Lowest`, `Lower`, `Higher`, `Highest`.*

| Note style | Symbol            | Meaning                     |
| ---------- | ----------------- | --------------------------- |
| `Lowest`   | Oval, bottom line | Lowest bell, bottom line    |
| `Lower`    | Oval, third line  | Second lowest, third line   |
| `Higher`   | Oval, second line | Second highest, second line |
| `Highest`  | Oval, top line    | Highest bell, top line      |

**Articulations:** none, for the same reason as on the two-bell agogô.

**Playback:** each style plays its own bell.

## Chocalho

The shaker, played with a shaking motion rather than a stroke.

**Staff:** one line. The notehead is a triangle.

![Chocalho notation: a triangle note and a ghost variant](../images/notation/chocalho.png)

*`Chocalho`, then the ghost variant.*

| Note style | Symbol                  | Meaning       |
| ---------- | ----------------------- | ------------- |
| `Chocalho` | Triangle                | Regular shake |
| `Ghost`    | Triangle in parentheses | Light shake   |

**Articulations:** `Ghost`. The light variant is the only articulation the instrument provides.

**Playback:** the excitation is a shake, so the two styles differ in level rather than in the striking technique.

## Tamborim

The small frame drum, played with a stick.

**Staff:** one line. The notehead is a cross.

![Tamborim notation: an accented cross note and a ghost variant](../images/notation/tamborim.png)

*`Accent`, then the ghost variant.*

| Note style | Symbol               | Meaning                            |
| ---------- | -------------------- | ---------------------------------- |
| `Accent`   | Cross, accented      | Accented stroke                    |
| `Ghost`    | Cross in parentheses | Light stroke, drawn in parentheses |

**Articulations:** `Accent` and `Ghost`. The accented style already sounds accented.

**Playback:** both styles are single strokes on the same skin; they differ only in level.

## Repinique

The lead drum of the bateria, played with a stick and with the hand.

**Staff:** one line. The stick strokes mostly use an oval notehead; `Rim` uses a cross, and the two hand strokes use a square.

![Repinique notation: all seven note styles in one bar](../images/notation/repinique.png)

*All seven styles in bar order: `Center`, `Outer Area`, `Rimshot`, `Rim`, `Buzz`, `Open`, `Slap`.*

| Note style   | Symbol                        | Meaning                                |
| ------------ | ----------------------------- | -------------------------------------- |
| `Center`     | Oval, accented                | Stroke on the centre of the head       |
| `Outer Area` | Oval                          | Stroke near the rim area               |
| `Rimshot`    | Oval with a cross over it     | Stick on rim and head at the same time |
| `Rim`        | Cross with a line below       | Stick on the rim only                  |
| `Buzz`       | Oval, slashes on the stem     | Pressed roll with a buzzing sound      |
| `Open`       | Square with a ring            | Open hand stroke                       |
| `Slap`       | Square with a cross, accented | Slap with the hand                     |

**Articulations:** `Accent`, on the centre stroke. The rim, buzz, and hand techniques have no accent variant, so the button is unavailable while one of them is selected.

**Playback:** `Center` and `Slap` already sound accented; the other styles are plain strokes.

## Repinique (Whippy Sticks)

The same drum played with flexible whippy sticks, which gives a lighter, higher sound.

**Staff:** one line, oval noteheads.

![Repinique with whippy sticks in notation: a normal stroke and a ghost variant](../images/notation/repinique-whippy.png)

*`Normal`, then the ghost variant.*

| Note style | Symbol              | Meaning                            |
| ---------- | ------------------- | ---------------------------------- |
| `Normal`   | Oval, accented      | Normal stroke with whippy sticks   |
| `Ghost`    | Oval in parentheses | Light stroke, drawn in parentheses |

**Articulations:** `Accent` and `Ghost`.

**Playback:** the normal stroke already sounds accented, so quiet passages need the ghost style.

## Caixa

The snare drum of the bateria, played with two sticks.

**Staff:** one line, oval noteheads.

![Caixa notation: normal stroke, ghost note, press roll, and rimshot](../images/notation/caixa.png)

*`Normal`, `Ghost`, `Press Roll`, `Rimshot`.*

| Note style   | Symbol                    | Meaning                                |
| ------------ | ------------------------- | -------------------------------------- |
| `Normal`     | Oval, accented            | Normal stroke                          |
| `Ghost`      | Oval in parentheses       | Light stroke, drawn in parentheses     |
| `Press Roll` | Oval, slashes on the stem | Pressed roll                           |
| `Rimshot`    | Oval with a cross over it | Stick on rim and head at the same time |

**Articulations:** `Accent` and `Ghost`.

**Playback:** the normal stroke already sounds accented; ghost notes, the press roll, and the rimshot have their own sounds.

## Timbau

The hand drum, played with open, slap, and bass strokes.

**Staff:** one line, square noteheads.

![Timbau notation: open, slap, and bass strokes](../images/notation/timbau.png)

*`Open`, `Slap`, `Bass`.*

| Note style | Symbol                        | Meaning                               |
| ---------- | ----------------------------- | ------------------------------------- |
| `Open`     | Square with a ring            | Open hand stroke                      |
| `Slap`     | Square with a cross, accented | Slap with the hand                    |
| `Bass`     | Square with a dot             | Bass stroke with the heel of the hand |

**Articulations:** none. The three styles are different hand techniques rather than variants of one stroke.

**Playback:** the slap already sounds accented; open and bass strokes are plain.

## Surdo Terceira

The smallest and highest of the three surdos.

**Staff:** one line. Stick strokes are ovals; a stroke with the free hand — damping the head or playing a note of its own — is a square.

![Surdo Terceira notation: an open stroke and a muted stroke](../images/notation/surdo-terceira.png)

*`Center`, then `Muted`.*

| Note style | Symbol           | Meaning             |
| ---------- | ---------------- | ------------------- |
| `Center`   | Oval             | Open stroke         |
| `Muted`    | Oval with a plus | Damped stick stroke |

**Articulations:** `Damped`, which is the same sound as the muted style and is offered for notes that use the open style.

**Playback:** the muted stroke is shorter and duller; the two styles are otherwise identical. The damping comes from the free hand resting on the head, or — as in Roda de Samba — from pressing the stick onto the head right after the hit.

## Surdo Segunda

The middle surdo, between the terceira and the primeira.

**Staff:** one line. Stick strokes are ovals; a stroke with the free hand — damping the head or playing a note of its own — is a square.

![Surdo Segunda notation: an open stroke and a muted stroke](../images/notation/surdo-segunda.png)

*`Center`, then `Muted`.*

| Note style | Symbol           | Meaning             |
| ---------- | ---------------- | ------------------- |
| `Center`   | Oval             | Open stroke         |
| `Muted`    | Oval with a plus | Damped stick stroke |

**Articulations:** `Damped`, as on the terceira.

**Playback:** same behaviour as the terceira, with the deeper sound.

## Surdo Primeira

The largest and lowest surdo, which carries the pulse of the bateria.

**Staff:** one line. Stick strokes are ovals; a stroke with the free hand — damping the head or playing a note of its own — is a square.

![Surdo Primeira notation: an open stroke and a muted stroke](../images/notation/surdo-primeira.png)

*`Center`, then `Muted`.*

| Note style | Symbol           | Meaning             |
| ---------- | ---------------- | ------------------- |
| `Center`   | Oval             | Open stroke         |
| `Muted`    | Oval with a plus | Damped stick stroke |

**Articulations:** `Damped`, as on the other two surdos.

**Playback:** the deepest of the three surdos.

## Related Chapters

- [Editing in the Staff View](using/staff-editing.md) explains note styles, articulations, and dynamics in practice.
- [Playback and Practice](using/playback.md) explains the mixer and how single notes are previewed.
- [Glossary](reference/glossary.md) defines the music terms used here.
