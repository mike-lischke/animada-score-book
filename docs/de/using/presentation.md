# Einen Score lesen: grid view, staff view, Musikfonts und Themes

Dieses Kapitel handelt vom Betrachten eines Score statt vom Ändern: die beiden Darstellungen, die Wahl von Font und Farbe und die Bedienelemente, die auf einem Bildschirm jeder Größe helfen.

## grid view

Die grid view legt den Score als Matrix aus:

- Jede bar ist eine Spalte, jeder track eine Zeile.
- Jede Zelle trägt ein Symbol, pro track eingefärbt, sodass ein rhythmisches Muster als Form erscheint.
- Alle bars des Score werden gerendert, was die grid view zur schnelleren Ansicht macht, um ein ganzes Stück zu überblicken.

Die grid view wird zum Bearbeiten in [Bearbeiten in der grid view](grid-editing.md) beschrieben; die darstellerischen Aspekte sind das Symbol pro Zelle und die Farbe, die den track kennzeichnet.

![grid view von Ijexá mit einer Spalte pro bar und einer Zeile pro track](../../images/en/presentation/grid-view.png)

*bars 3 bis 5 von Ijexá in der grid view: ein Symbol pro Schritt, pro track eingefärbt.*

## staff view

Die staff view zeigt Perkussionsnotation:

- Jeder track bekommt eine eigene Systemzeile mit einem Perkussionsschlüssel.
- Notenwerte, Pausen, Notenhälse, Balken und tuplets werden wie in gedruckter Musik gezeichnet.
- Articulations wie Akzente, Geisternoten-Klammern und Dämpfungszeichen stehen neben den Notenköpfen.
- Die Taktart steht am Anfang, und Wiederholungstaktstriche erscheinen dort, wo der Score sie hat.

Das ist die Ansicht, die die meisten Spieler lesen, und die die Druckausgabe verwendet.

![staff view von Ijexá während der Wiedergabe, mit dem Playhead in bar 5](../../images/en/presentation/staff-view.png)

*Dieselbe Passage als Notenschrift während der Wiedergabe; die blaue Linie ist der Playhead, der Footer nennt die sichtbaren bars.*

## Zwischen den Ansichten wechseln

Die mode bar beim Score trägt zwei Segmente:

| Segment | Tooltip                                | Tastenkürzel |
| ------- | -------------------------------------- | ------------ |
| `Grid`  | `Show the score as a note grid (G)`    | `G`          |
| `Staff` | `Show the score as staff notation (S)` | `S`          |

Die Kürzel funktionieren, solange der Fokus nicht in einem Textfeld liegt. Ein Wechsel ist während der Wiedergabe möglich und behält die Position im Score. Die zuletzt gewählte Ansicht wird in deinem Browser gemerkt.

## Musikfonts

`Settings` → `Music font` entscheidet, welcher SMuFL-Font Noten, Pausen, Schlüssel und Taktstriche zeichnet:

| Font        | Hinweis                     |
| ----------- | --------------------------- |
| `Bravura`   | Der Standard, von Steinberg |
| `Eugene`    | Von Mikko Patama            |
| `Gootville` |                             |
| `Leipzig`   |                             |
| `Leland`    |                             |
| `Petaluma`  |                             |
| `Sebastian` |                             |

Jeder Font bringt eigene Satzmetriken mit, sodass sich Abstände und Formen der Notenköpfe mit ihm ändern; die Wiedergabe bleibt unberührt. Die Info-Schaltfläche neben der Liste zeigt Version, Copyright, Lizenz und Quelle des Fonts. Alle mitgelieferten Fonts stehen unter der SIL Open Font License.

Die Auswahlliste zeichnet jeden Eintrag als Probe in seinem Font, sodass du sie vor der Wahl vergleichen kannst.

![Der Musikfont-Wähler mit Proben pro Font](../../images/en/settings/music-font-picker.png)

*Der Wähler zeichnet jeden Fontnamen im Font selbst, sodass der Vergleich vor der Wahl beginnt.*

![Das Info-Popup des Fonts](../../images/en/settings/music-font-info.png)

*Die Info-Schaltfläche neben dem Wähler nennt Version, Copyright, Lizenz und Quelle des gewählten Fonts; hier Bravura 1.482.*

![Dieselbe bar in Bravura, Leipzig, Petaluma und Sebastian](../../images/en/presentation/music-fonts.png)

*Eine bar von Ijexá in vier der mitgelieferten Fonts: Bravura (Standard), Leipzig, Petaluma und Sebastian.*

## Farbschemata

`Settings` → `Color theme` bietet:

- `Auto`, das der hellen oder dunklen Einstellung des Betriebssystems folgt.
- Vier helle Themes: `Light+`, `Light High Contrast`, `Quiet Light`, `Solarized Light`.
- Neun dunkle Themes: `Dark+`, `Dark High Contrast`, `Abyss`, `Kimbie Dark`, `Monokai`, `Monokai Dimmed`, `Red`,
  `Solarized Dark`, `Tomorrow Night Blue`.

Ein Theme ändert die Farben der Oberfläche. Die Wahl wird in deinem Browser gespeichert und gilt auch beim nächsten Start.

![Dieselbe bar in vier Farbschemata](../../images/en/presentation/themes.png)

*Zwei helle und zwei dunkle Themes auf derselben bar: `Light+`, `Dark+`, `Monokai Dimmed` und `Solarized Light`.*

## Zoom

Der track viewer zoom skaliert den Score-Bereich und ist an zwei Stellen verfügbar:

- Über die Schaltflächen `Zoom out` und `Zoom in` im Footer.
- Über `Settings` → `Track viewer zoom`, zusammen mit einer Schaltfläche `Reset`.

Der Bereich reicht von 50 % bis 150 % in Schritten von 10, mit 100 % als Standard. Der Zoom ist manuell: Es gibt keinen Pinch- oder Radzoom. `Fit width` und `Fit page` gibt es nur in der print preview.

![Der Dialog Settings](../../images/en/settings/settings-rows.png)

*Der ganze Dialog Settings: Farbschema, Musikfont, track viewer zoom mit `Reset`, der Schalter für das automatische Verlängern und der Berechtigungsindikator.*

## Der score navigator

Der Footer zeigt, wo du bist, und lässt dich springen:

- Die Beschriftung liest `Bar 5 of 32`, oder `Bars 5 – 9 of 32`, wenn mehr als eine bar sichtbar ist.
- Der Streifen daneben repräsentiert den ganzen Score; Ziehen verschiebt den Ausschnitt.

![Der Footer mit Navigator, Zoom, Zen mode, Version und Benachrichtigungen](../../images/en/presentation/footer.png)

*Der Footer von links nach rechts: die sichtbaren bars, der Navigatorstreifen, der Zoom-Schrittregler, Zen mode, die Versionsschaltfläche mit den Release Notes und die Glocke des notification center.*

## Release Notes

Die Versionsschaltfläche am rechten Ende des Footer öffnet die Release Notes: jede veröffentlichte Version, die neueste zuerst, jeweils mit einer kurzen Liste ihrer Änderungen. `Close` führt zum Score zurück. Die Notizen gehören zum laufenden Build, beschreiben also die Version, die die Schaltfläche nennt.

![Der Dialog Release Notes](../../images/en/presentation/release-notes.png)

*Der Dialog Release Notes, geöffnet über die Versionsschaltfläche: die Versionshistorie, die neueste zuerst, mit `Close` unten rechts.*

## Zen mode

`Enter Zen mode` im Footer reduziert den Bildschirm auf den Score:

- Header und mode bar verschwinden, und der Titel des Score rückt über die Notation.
- Die track-Spalte behält nur die Instrumentnamen.
- Bearbeiten ist nicht möglich, solange der Zen mode aktiv ist.
- Ziehen mit dem Zeiger verschiebt den Score in beide Richtungen.

Dieselbe Schaltfläche im Footer liest dann `Exit Zen mode` und stellt das volle Layout wieder her. `Escape` hebt außerhalb des Zen mode die Auswahl auf, verlässt den Zen mode aber nicht.

![Zen mode von Ijexá: nur Instrumentnamen und Notation bleiben](../../images/en/presentation/zen-mode.png)

*Zen mode: kein Header, keine mode bar, nur Instrumentnamen in der track-Spalte.*

## Telefone und Tablets

Das Layout passt sich der verfügbaren Breite an:

- Auf schmalen Bildschirmen faltet die playback bar Loop, Metronom, Count-in und Lautstärke in das Menü
  `More playback controls`, und der Footer faltet Zoom und Versionsschaltfläche in ein eigenes Menü.
- Die Score Library öffnet sich als Drawer über dem Score statt daneben.
- Der Score-Bereich behält dieselben Ansichten, grid view und staff view bleiben also nutzbar.

![Die staff view auf einem Telefon](../../images/en/presentation/mobile-staff.png)

*390 Pixel breit: die mode bar über dem Score, die Ticker-Beschriftungen auf Symbole reduziert und die playback bar auf `Play`, Tempo und ein Menü zusammengefaltet.*

![Die grid view auf einem Tablet](../../images/en/presentation/tablet-grid.png)

*1024 Pixel breit: der Header behält jede Aktion, der mixer bleibt neben dem Score ausgeklappt.*

## Das notification center

Nachrichten erscheinen als Toasts und werden hinter der Glocke im Footer gesammelt:

- Der Tooltip der Schaltfläche zählt neue Nachrichten, zum Beispiel `2 new notifications`.
- Ein Druck darauf öffnet die Historie früherer Nachrichten; ein weiterer Druck oder `Hide notifications` schließt sie.
- Ein Nicht-stören-Zustand unterdrückt gewöhnliche Nachrichten; Fehler werden weiterhin angezeigt.

![Das notification center mit der gesammelten Paste-Warnung](../../images/en/presentation/notification-center.png)

*Die Historie mit ihren Steuerelementen zum Leeren, für Nicht stören und zum Ausblenden; der Header zählt die Nachrichten, die noch neu sind.*

## Verwandte Kapitel

- [Bearbeiten in der staff view](staff-editing.md) und [Bearbeiten in der grid view](grid-editing.md) behandeln das Ändern des
  Score in beiden Darstellungen.
- [Instrument- und Notationsreferenz](../instruments.md) erklärt die Symbole, die du siehst.
- [Drucken, PDF und MP3-Export](printing-and-export.md) behandelt das gedruckte Ergebnis.
