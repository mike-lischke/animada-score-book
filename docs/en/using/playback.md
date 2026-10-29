# Playback and Practice

The playback bar and the mixer turn a score into a rehearsal: the instruments of the score play together, one track can be boosted while the others step back, and a metronome or count-in keeps the time.

## Starting and Stopping

The round button at the left end of the playback bar starts and stops the score; its tooltip reads `Play the score` or `Stop playback`. Stopping returns to the start of the performed range, so the next start begins there.

![The playback bar with play, tempo, loop, metronome, count-in and volume](../../images/en/playback/playback-bar.png)

*The playback bar: play, `BPM` stepper, loop, metronome, count-in, and the master volume; the three switches carry a dot that fills in when they are on.*

## Tempo

The tempo stepper shows the current tempo in `BPM` and changes it with `-` and `+`:

- The range is 30 to 200 BPM in steps of 5.
- A star next to the value, for example `118*`, means the playback tempo differs from the tempo stored in the score.
- Without edit mode the change is temporary. With edit mode active the new tempo is written into the score when you
  save.

## Master Volume

The slider labelled `Master volume` sets the overall level between 0 % and 100 %. It scales everything, including the note samples you hear when you click a note.

## The Mixer

The mixer lives in the track column at the left of the score. `Expand mixer` and `Collapse mixer` switch between the instrument names only and the full volume column:

| Position       | Effect                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------- |
| `0`            | The track is silent — the left end of the column is labelled `◀︎ Mute`                     |
| `1` to `100 %` | The track plays at its normal level                                                       |
| above `100 %`  | The track is boosted, and the other tracks are attenuated — the right end reads `Focus ▶︎` |

The focus boost is not a solo button: the other tracks stay audible, only quieter. Per-track levels are part of your working state and are saved with the score.

![The expanded mixer with one slider per track](../../images/en/playback/mixer.png)

*The expanded mixer of Ijexá: one slider and one instrument icon per track, `◀ Mute` at the left end and `Focus ▶` at the right.*

## Metronome and Count-In

Two switches sit next to the tempo:

- `Metronome` adds a click on every beat.
- `Play a count-in before playback starts` plays one bar of count-in before the score begins. The count uses spoken
  numbers and is not one of the selectable instruments.

Both are independent of the score's content and can be combined with the loop.

## Looping

`Loop playback` repeats the performed range until you stop. Without a Play Focus it repeats the whole score; with a Play Focus it repeats that range.

Loop is a playback feature only: it is not part of an MP3 export.

## Play Focus

Every bar header carries a `Play Focus` button. Marking bars confines playback to them:

- With no bar focused, playback uses the whole score.
- With bars focused, playback starts at the first focused bar and ends at the last one.
- The setting is a playback range, not a selection: it does not change the score and is not saved as content.

The same control exists in the grid view and in the staff view.

![Two bars marked as play focus](../../images/en/playback/play-focus.png)

*Bars 2 and 3 focused: their `Play Focus` buttons are active, the neighbours are not, and the mixer sliders show the per-track `Mute` and `Focus` ends.*

## Playback Order and Repeats

Playback follows the repeat barlines of the score, not the written order from left to right. A `Repeat start` and `Repeat end` pair is played twice, and a one-bar repeat (simile) plays the bar it stands for. The footer's bar caption and the score navigator show where you are while this happens.

## Playhead and Scrolling

While the score plays, a playhead moves through it and the view follows so the current bars stay visible. You can still scroll while it plays; the playhead keeps moving in the score.

## Hearing a Single Note

Clicking a note plays its sample, which helps while arranging: the instrument answers before the transport runs. The master volume applies here as well.

## Narrow Screens

On small screens the playback bar keeps the transport and the tempo and folds `Loop playback`, `Metronome`, `Count-in`, and `Volume` into the `More playback controls` menu. A dot on that button shows when one of these options is active.

## Related Chapters

- [Reading a Score](presentation.md) explains the views and the footer.
- [Editing in the Staff View](staff-editing.md) creates the repeats, simile marks, and dynamics that playback uses.
- [Printing, PDF and MP3 Export](printing-and-export.md) covers exporting playback as a file.
