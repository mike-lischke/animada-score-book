# Wiedergabe und Üben

Die playback bar und der mixer machen aus einer Partitur (englisch: score) eine Probe: Die Instrumente der Partitur spielen zusammen, ein track kann angehoben werden, während die anderen zurücktreten, und ein Metronom oder Count-in hält die Zeit.

## Starten und Stoppen

Die runde Schaltfläche am linken Ende der playback bar startet und stoppt die Partitur; ihr Tooltip liest `Play the score` oder `Stop playback`. Stoppen kehrt an den Anfang des gespielten Bereichs zurück, sodass der nächste Start dort beginnt.

![Die playback bar mit Play, Tempo, Loop, Metronom, Count-in und Lautstärke](../../images/en/playback/playback-bar.png)

*Die playback bar: Play, `BPM`-Schrittregler, Loop, Metronom, Count-in und die Master-Lautstärke; die drei Schalter tragen einen Punkt, der sich füllt, wenn sie an sind.*

## Tempo

Der Tempo-Schrittregler zeigt das aktuelle Tempo in `BPM` und ändert es mit `-` und `+`:

- Der Bereich reicht von 30 bis 200 BPM in Schritten von 5.
- Ein Stern neben dem Wert, zum Beispiel `118*`, bedeutet, dass das Wiedergabetempo vom in der Partitur gespeicherten Tempo
  abweicht.
- Ohne edit mode ist die Änderung vorübergehend. Im edit mode wird das neue Tempo in die Partitur geschrieben, wenn du
  speicherst.

## Master-Lautstärke

Der Regler mit der Bezeichnung `Master volume` stellt den Gesamtpegel zwischen 0 % und 100 % ein. Er skaliert alles, auch die Notensamples, die du beim Klick auf eine Note hörst.

## Der mixer

Der mixer lebt in der track-Spalte links von der Partitur. `Expand mixer` und `Collapse mixer` wechseln zwischen den reinen Instrumentnamen und der vollen Lautstärkespalte:

| Position        | Wirkung                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `0`             | Der track ist stumm — das linke Ende der Spalte ist mit `◀︎ Mute` beschriftet                        |
| `1` bis `100 %` | Der track spielt auf seinem normalen Pegel                                                           |
| über `100 %`    | Der track wird angehoben, und die anderen tracks werden abgesenkt — das rechte Ende liest `Focus ▶︎` |

Der Focus-Boost ist keine Solo-Taste: Die anderen tracks bleiben hörbar, nur leiser. Die Pegel pro track gehören zu deinem Arbeitszustand und werden mit der Partitur gespeichert.

![Der ausgeklappte mixer mit einem Regler pro track](../../images/en/playback/mixer.png)

*Der ausgeklappte mixer von Ijexá: ein Regler und ein Instrumentensymbol pro track, `◀ Mute` am linken und `Focus ▶` am rechten Ende.*

## Metronom und Count-in

Zwei Schalter stehen neben dem Tempo:

- `Metronome` setzt einen Klick auf jeden Schlag.
- `Play a count-in before playback starts` spielt einen Takt (englisch: bar) Count-in, bevor die Partitur beginnt. Der Count-in nutzt
  gesprochene Zahlen und ist keines der wählbaren Instrumente.

Beide sind unabhängig vom Inhalt der Partitur und lassen sich mit dem Loop kombinieren.

## Looping

`Loop playback` wiederholt den gespielten Bereich, bis du stoppst. Ohne Play Focus wiederholt es die ganze Partitur; mit einem Play Focus wiederholt es diesen Bereich.

Loop ist eine reine Wiedergabefunktion: Er gehört nicht zu einem MP3-Export.

## Play Focus

Jeder Taktkopf trägt eine Schaltfläche `Play Focus`. Markierte Takte beschränken die Wiedergabe auf sich:

- Ohne fokussierten Takt verwendet die Wiedergabe die ganze Partitur.
- Mit fokussierten Takten beginnt die Wiedergabe beim ersten fokussierten Takt und endet beim letzten.
- Die Einstellung ist ein Wiedergabebereich, keine Auswahl: Sie ändert die Partitur nicht und wird nicht als Inhalt
  gespeichert.

Dasselbe Element gibt es in der grid view und in der staff view.

![Zwei Takte als Play Focus markiert](../../images/en/playback/play-focus.png)

*Takte 2 und 3 fokussiert: ihre Schaltflächen `Play Focus` sind aktiv, die Nachbarn nicht, und die Regler des mixer zeigen die Enden `Mute` und `Focus` pro track.*

## Wiedergabereihenfolge und Wiederholungen

Die Wiedergabe folgt den Wiederholungstaktstrichen der Partitur, nicht der geschriebenen Reihenfolge von links nach rechts. Ein Paar aus `Repeat start` und `Repeat end` wird zweimal gespielt, und eine Wiederholung über einen Takt (simile) spielt den Takt, für den sie steht. Die Taktbeschriftung im Footer und der Partiturnavigator zeigen, wo du dich dabei befindest.

## Playhead und Scrollen

Während die Partitur spielt, bewegt sich ein Playhead durch sie, und die Ansicht folgt, damit die aktuellen Takte sichtbar bleiben. Du kannst während der Wiedergabe weiter scrollen; der Playhead bewegt sich in der Partitur weiter.

## Eine einzelne Note hören

Ein Klick auf eine Note spielt ihr Sample, was beim Arrangieren hilft: Das Instrument antwortet, bevor der Transport läuft. Die Master-Lautstärke gilt auch hier.

## Schmale Bildschirme

Auf kleinen Bildschirmen behält die playback bar den Transport und das Tempo und faltet `Loop playback`, `Metronome`, `Count-in` und `Volume` in das Menü `More playback controls`. Ein Punkt auf dieser Schaltfläche zeigt, wenn eine dieser Optionen aktiv ist.

## Verwandte Kapitel

- [Eine Partitur lesen](presentation.md) erklärt die Ansichten und den Footer.
- [Bearbeiten in der staff view](staff-editing.md) legt die Wiederholungen, simile-Zeichen und dynamics an, die die Wiedergabe
  nutzt.
- [Drucken, PDF und MP3-Export](printing-and-export.md) behandelt den Export der Wiedergabe als Datei.
