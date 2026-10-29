# Bearbeiten in der staff view

Die staff view ist der Ort, an dem Noten geschrieben werden. Bearbeiten braucht den edit mode, der den Score für andere Bearbeiter sperrt, und jede Änderung zählt als ein Undo-Schritt und markiert den Score als ungespeichert.

Dieses Kapitel folgt einer Sitzung: den edit mode betreten, Noten setzen, sie formen und Struktur um sie herum legen.

## Den edit mode betreten

Der Umschalter `Edit Mode` im Header liest `Editing`, wenn der edit mode aktiv ist. In diesem Moment passieren drei Dinge:

- Der Score wird gesperrt, sodass einem zweiten Bearbeiter `Score is being edited by <user> (since <date and time>)`
  gemeldet wird.
- Der Editor ergänzt einen sichtbaren Cursor, einen Streifen mit bar-Aktionen über den bars und eine Aktionsschaltfläche
  auf jeder track-Zeile.
- Die mode bar erhält einen Abschnitt `Entry` neben `View`.

Der edit mode braucht nur Lesezugriff. Ohne angemeldetes Konto kannst du den Score bearbeiten, und die Änderungen bleiben in diesem Browser; `Save Score` meldet dann `Sign in to save this score.` Ein angemeldetes Konto ohne Schreibzugriff wird abgewiesen, wenn es den edit mode betreten will, mit `You do not have permission to edit this score.`

`Save Score` im Header oder `Ctrl`/`Cmd`+`S` schreibt den Score ins Backend. Das Verlassen des edit mode speichert zuerst und gibt die Sperre frei; ein gescheitertes Speichern hält dich im edit mode, damit nichts verloren geht.

![staff view im edit mode mit ausgewählter Note und geöffnetem note style-Popup](../../images/en/staff-editing/edit-mode.png)

*Edit mode: die mode bar bietet `Entry`, die Symbole für bar-Aktionen sitzen über den bars, und eine ausgewählte Note öffnet das Popup für den note style.*

## Noten eingeben

Noten werden am Cursor eingegeben:

1. Klicke auf eine Position im Score oder bewege den Cursor mit den Pfeiltasten. Der Cursor wandert über bars und tracks
   und läuft an den Enden um.
2. Wähle einen note style. Die Tasten `1` bis `9` geben den style an dieser Position der Instrumentenliste ein, und der
   Abschnitt für note styles in der Werkzeugleiste tut dasselbe nach Namen.
3. Wähle einen Notenwert vor oder nach der Eingabe; die Länge gilt für die Note am Cursor.

`0` gibt eine Pause ein, `Delete` und `Backspace` entfernen die Note oder Pause am Cursor. Notenwerte, Balken, Fähnchen und Halsrichtungen folgen den eingegebenen Werten und der Gruppierung, die die bar ergibt.

## Notenwerte und Punkte

Der Abschnitt `Note value / duration` bietet ganze, halbe, Viertel-, Achtel-, Sechzehntel- und Zweiunddreißigstelnoten. Der Punktwert ist ein Umschalter, und beide sind auch über die Tastatur erreichbar:

| Tastenkürzel                      | Wirkung                                                       |
| --------------------------------- | ------------------------------------------------------------- |
| `Alt`/`Cmd`+`1` … `Alt`/`Cmd`+`6` | Setzt die Länge von der ganzen bis zur Zweiunddreißigstelnote |
| `Alt`/`Cmd`+`.`                   | Schaltet den Punkt des aktuellen Werts um                     |

Die Werkzeugleiste für Notenlängen existiert nur in der staff view; die grid view arbeitet mit festen Schritten.

![Die Zeile der Notenwerte in der Werkzeugleiste](../../images/en/staff-editing/note-length.png)

*Von der ganzen bis zur Zweiunddreißigstelnote in der Zeile der Notenwerte, mit dem Punkt-Umschalter rechts in aktivem Zustand.*

## Pausen

Eine Pause wird wie eine Note eingegeben, mit `0` oder der Pausen-Schaltfläche. Pausen behalten ihre Länge und lassen sich wie Noten auswählen und ändern. Eine bar ohne Inhalt zeigt eine Pause über die ganze bar, und eine Folge von Pausen bleibt sichtbar und auswählbar, statt zu verschwinden.

## note styles und Spieltechniken

Jedes Instrument bringt seine eigene Liste von note styles mit, und der Abschnitt `Note style & technique` listet sie für den track, in dem der Cursor steht. Ein style entscheidet über Klang und Symbol zugleich, sodass die Wahl von `Slap` auf einem Timbau sowohl das Gehörte als auch das Gezeichnete ändert. [Instrument- und Notationsreferenz](../instruments.md) beschreibt die styles pro Instrument.

![Die note style-Karte eines Repinique-track](../../images/en/staff-editing/note-styles.png)

*Die Karte eines Repinique-track in bar 3: acht styles, die Zeile der Notenwerte und die articulations, die das Instrument bietet.*

## Articulations

Der Abschnitt `Articulation` bietet `Accent`, `Damped` und `Ghost`. Welche davon verfügbar sind, hängt von den styles des Instruments ab; die Zeichen werden neben dem Notenkopf gezeichnet, ohne den gewählten style zu ändern. Die aktive Schaltfläche gilt für die Noten am Cursor, und die Wahl einer anderen Schaltfläche ersetzt das Zeichen.

![Der Abschnitt Articulation der Werkzeugleiste](../../images/en/staff-editing/articulations.png)

*`Accent`, `Damped` und `Ghost` als Schaltflächen; die beiden, für die das Instrument keine Variante hat, bleiben ausgegraut.*

## Überschreiben und Einfügen

Der Abschnitt `Entry` der mode bar entscheidet, was eine neue Note mit dem Inhalt hinter dem Cursor macht:

| Modus       | Tooltip                                                    | Taste |
| ----------- | ---------------------------------------------------------- | ----- |
| `Overwrite` | `Enter notes by replacing the content at the cursor (O)`   | `O`   |
| `Insert`    | `Enter notes by pushing the content behind the cursor (I)` | `I`   |

Der gewählte Modus wird in deinem Browser gemerkt. Die grid view arbeitet immer im Modus `Overwrite`, weil ihr Raster keinen Platz zum Verschieben hat.

![Die mode bar mit aktivem Staff und Overwrite](../../images/en/staff-editing/entry-modes.png)

*Die mode bar: `View` wechselt zwischen grid view und staff view, `Entry` zwischen Overwrite und Insert.*

## Auswählen

Auswahl ist der Griff für alles, was auf vorhandenen Inhalt wirkt:

- Klicke eine Note an, um sie auszuwählen.
- `Shift`+Klick fügt der Auswahl weitere Noten hinzu.
- Ziehe ein Rechteck auf, um die Notengruppen auszuwählen, die es bedeckt.
- `Escape` hebt die Auswahl auf.

Eine Bereichsauswahl beginnt immer auf einer vorhandenen Note: Die erste Note verankert die Auswahl, und das Rechteck oder der nächste `Shift`+Klick erweitert sie nur. Ein Start auf einer leeren Zelle setzt lediglich den Eingabecursor.

Die Auswahl behält die Granularität des zuerst berührten Elements: Eine Auswahl, die auf einer Note begann, bleibt eine Notenauswahl, eine, die auf einer ganzen bar begann, bleibt eine bar-Auswahl.

Eine Auswahl, die ganze bars eines track bedeckt, öffnet die Werkzeugleiste für track pieces mit der Wiederholung über eine bar und der Aktion zum Leeren. Eine Auswahl von Noten öffnet die Karte mit note styles, Werten, articulations und tuplets.

![bars 4 und 5 der Agogô-tracks ausgewählt](../../images/en/staff-editing/selection.png)

*Eine Auswahl über zwei bars der Agogô-tracks; die Karte für die ausgewählten Noten öffnet sich darunter.*

![Die track piece-Werkzeugleiste einer ausgewählten bar](../../images/en/staff-editing/selection-actions.png)

*Eine Auswahl über eine ganze bar behält zwei Aktionen: die Wiederholung über eine bar und das Leeren.*

## Subdivisions und tuplets

Eine subdivision unterteilt eine Position in ein tuplet. `Add subdivision` bietet acht Verhältnisse: Duplet, Triplet, Quadruplet, Quintuplet, Sextuplet, Septuplet, Octuplet und Nontuplet. Subdivisions lassen sich verschachteln: Wähle eine Note innerhalb einer subdivision und füge eine weitere hinzu, und das neue tuplet sitzt in diesem Slot. Die Beschriftung des äußeren tuplet wird über der Gruppe gezeichnet, die eines verschachtelten tuplet darunter.

![Die Verhältnisliste der Subdivision-Schaltfläche](../../images/en/staff-editing/subdivisions.png)

*`Add subdivision` öffnet die Verhältnisse ab einem Duplet nach unten; die Liste setzt sich unterhalb des sichtbaren Teils der Karte fort.*

![Ein Quintuplet mit einem in seinen dritten Slot verschachtelten Triplet](../../images/notation/tuplets.png)

*Das Quintuplet trägt seine Beschriftung über der Gruppe, das im dritten Slot verschachtelte Triplet eine darunter.*

[Bearbeiten in der grid view](grid-editing.md#subdivisions-in-der-grid-view) zeigt dieselbe bar ohne die Beschriftungen, wo ein tuplet als schmalere Slots innerhalb seiner Zelle erscheint.

Die subdivision ist ein Block, solange sie existiert: Noten darin werden innerhalb des tuplet adressiert, nicht im einfachen Schritt-Raster der bar.

Das Kopieren einer subdivision und das Einfügen in einen anderen Abschnitt fragt, wie sie angewendet werden soll:

| Antwort                | Ergebnis                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `New Subdivision`      | Die kopierten Noten werden zu einer neuen subdivision innerhalb des ausgewählten Abschnitts |
| `Tile Subdivision`     | Das kopierte Muster wiederholt sich, bis der ausgewählte Abschnitt gefüllt ist              |
| `Dissolve Subdivision` | Die Noten werden über den ausgewählten Abschnitt verteilt, ohne tuplet                      |

## bar-Aktionen

Der Streifen mit bar-Aktionen über den bars bietet pro bar:

- `Insert bars to the left` und `Insert bars to the right`
- `Clear bar`, das die bar leert, sie aber behält
- `Delete bar`, das die bar aus dem Score entfernt
- `Duplicate bar`
- `Repeat start` und `Repeat end`, die Wiederholungstaktstriche setzen

Wiederholungstaktstriche ändern die Reihenfolge, die die Wiedergabe nutzt, nicht die geschriebene Reihenfolge des Score; siehe [Wiedergabe und Üben](playback.md).

![Die Symbole für bar-Aktionen in der mode bar](../../images/en/staff-editing/bar-actions.png)

*Zwischen den Modus-Umschaltern und den Werkzeugen: Einfügen, Leeren, Löschen, Duplizieren und die beiden Wiederholungstaktstriche, alles für die ausgewählte bar.*

## track-Aktionen

Die Aktionsschaltfläche einer track-Zeile öffnet das track-Menü, benannt nach dem Instrument:

- Einen neuen track hinzufügen. Seine Position im Arrangement hängt vom gewählten Instrument ab; der Dialog `Add Tracks`
  nimmt ein oder mehrere Instrumente.
- Diesen track duplizieren, einschließlich aller Noten und Einstellungen.
- Alle Noten und Einstellungen aus dem track entfernen.
- Diesen track und alle Noten darin löschen.

![Das track-Menü eines Agogô 4-Bell-track](../../images/en/staff-editing/track-actions.png)

*Die Aktionsschaltfläche einer track-Zeile öffnet Hinzufügen, Duplizieren, Leeren und Löschen für diesen track.*

## Wiederholung über eine bar

Die Werkzeugleiste für track pieces trägt eine Wiederholung über eine bar (simile) und eine Aktion zum Leeren:

- Das simile-Zeichen steht für die vorherige bar desselben track. In der ersten bar ist es nicht verfügbar, und der
  Tooltip sagt das auch.
- Die Wiedergabe spielt die bar, für die das Zeichen steht.
- Das Zeichen erscheint in beiden Ansichten; die grid view zeichnet das Wiederholungszeichen über den Takt, bietet aber
  keine Möglichkeit, es zu setzen.
- `Clear track piece` leert die bedeckten bars dieses track.

![Eine simile-bar mit der track piece-Werkzeugleiste](../../images/en/staff-editing/simile.png)

*Die zweite bar eines track: das simile-Zeichen steht für bar 1, und die Werkzeugleiste bietet die Wiederholung und die Aktion zum Leeren.*

## bar-Breiten

Der abschließende Taktstrich einer bar lässt sich ziehen, um diese bar schmaler oder breiter zu machen, was hilft, einer vollen bar mehr Raum zu geben oder mehr bars auf einen Bildschirm zu bringen. Ein Doppelklick auf den Griff stellt die automatische Breite wieder her. Die print preview bietet dieselbe Anpassung.

![Zwei bars unterschiedlicher Breite mit dem Griff zum Ziehen](../../images/en/staff-editing/measure-width.png)

*bars 2 und 3 mit unterschiedlichen Breiten; der Griff am rechten Taktstrich ist der Griff zum Ziehen.*

## Dynamics

Die Leiste `Tools` setzt Lautstärkemarken: `Crescendo`, `Decrescendo` und `Forte`. Ein Werkzeug bleibt zum Setzen aktiv und lässt sich mit `Cancel` oder `Escape` abbrechen. Gesetzte Marken lassen sich an eine andere Position ziehen und an ihren Griffen in der Größe ändern.

Dynamics wirken auf die Wiedergabelautstärke über den Abschnitt, den sie bedecken; die Noten selbst werden nicht geändert.

## Clipboard

`Ctrl`/`Cmd`+`C`, `X` und `V` kopieren, schneiden und fügen Score-Inhalt ein:

- Kopieren funktioniert in jedem Modus. Schneiden und Einfügen brauchen den edit mode.
- Das Einfügen in einen anderen track kann einen track anlegen, wenn die Quelle dort noch nicht existiert.
- Inhalt, der nicht zum Ziel passt, wird mit einer Meldung abgelehnt, statt falsch eingefügt zu werden:
  `Cannot paste: at least one instrument does not match.`, `Cannot paste: the meter does not match.`,
  `Cannot paste: the track count does not match.`, und eine Warnung über das Mischen von unterteilten und einfachen
  Auswahlen.

![Ein abgelehntes Einfügen meldet die Instrumenten-Abweichung](../../images/en/staff-editing/paste-warning.png)

*Die grid view meldet ein abgelehntes Einfügen; der Toast verschwindet, die Meldung bleibt im notification center.*

## Undo und Redo

Die Schaltflächen für Rückgängig und Wiederholen im Header nutzen dieselbe Historie wie die Tastatur:

| Tastenkürzel             | Wirkung                   |
| ------------------------ | ------------------------- |
| `Ctrl`/`Cmd`+`Z`         | Rückgängig                |
| `Ctrl`/`Cmd`+`Shift`+`Z` | Wiederholen               |
| `Ctrl`+`Y`               | Wiederholen unter Windows |

Eine Änderung ist ein Undo-Schritt. Das Ziehen einer bar-Breite oder einer dynamic wird einmal aufgezeichnet, wenn die Geste endet, nicht pro Pixel. Ein Neuladen der Anwendung beendet die Historie.

## Automatisches Verlängern

Mit aktivierter Einstellung `Add a bar when notes run past the last one` — dem Standard — hängt die Eingabe von Noten hinter der letzten bar eine bar an, statt die Note zu verwerfen. Das Abschalten der Einstellung hält die Länge des Score fest.

## Verwandte Kapitel

- [Instrument- und Notationsreferenz](../instruments.md) erklärt die note styles und Zeichen pro Instrument.
- [Bearbeiten in der grid view](grid-editing.md) behandelt den grid-Workflow und das, was nur die staff view kann.
- [Tastaturkürzel](../reference/keyboard-shortcuts.md) listet jede Taste in einer Tabelle.
- [Wiedergabe und Üben](playback.md) erklärt, wie Wiederholungen, simile und dynamics zu hören sind.
