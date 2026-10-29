# Tastaturkürzel

Die Anwendung hört auf einen kleinen Satz von Tasten, und jede gehört zu einem Kontext. Tippen in einem Textfeld gewinnt immer; die Tasten für die Partitur (englisch: score) wirken nur, solange der Partiturbereich den Fokus hat.

## Globale Kürzel

| Taste                    | Aktion                                                                                               | Verfügbar                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `Ctrl`/`Cmd`+`S`         | Die Partitur speichern                                                                               | Im edit mode                           |
| `Ctrl`/`Cmd`+`P`         | Die print preview statt des Druckdialogs des Browsers öffnen                                         | Immer                                  |
| `Ctrl`/`Cmd`+`C`         | Die Auswahl kopieren                                                                                 | Immer                                  |
| `Ctrl`/`Cmd`+`X`         | Die Auswahl ausschneiden                                                                             | Im edit mode                           |
| `Ctrl`/`Cmd`+`V`         | Das Clipboard einfügen                                                                               | Im edit mode                           |
| `G`                      | Zur grid view wechseln                                                                               | Immer                                  |
| `S`                      | Zur staff view wechseln                                                                              | Immer                                  |
| `Ctrl`/`Cmd`+`Z`         | Rückgängig                                                                                           | Außerhalb des Zen mode                 |
| `Ctrl`/`Cmd`+`Shift`+`Z` | Wiederholen                                                                                          | Außerhalb des Zen mode                 |
| `Ctrl`+`Y`               | Wiederholen unter Windows                                                                            | Außerhalb des Zen mode                 |
| `Escape`                 | Den obersten Dialog, das oberste Menü oder den obersten Drawer schließen; sonst die Auswahl aufheben | Außerhalb des Zen mode für die Auswahl |

`G` und `S` reagieren nur auf die nackte Taste, ohne `Ctrl`, `Cmd`, `Alt` oder `Shift`, sodass sie nicht mit Browser-Kürzeln kollidieren. `Ctrl`+`Y` wird bewusst nicht mit `Cmd` akzeptiert: Safari und Chrome verbinden eine eigene Bedeutung damit.

## Eingabe in der Partitur

| Taste                             | Aktion                                                              | Ansicht    |
| --------------------------------- | ------------------------------------------------------------------- | ---------- |
| `1` … `9`                         | Den note style an dieser Position der Instrumentenliste eingeben    | Beide      |
| `0`                               | Eine Pause am Cursor eingeben                                       | Beide      |
| `Alt`/`Cmd`+`1` … `Alt`/`Cmd`+`6` | Die Notenlänge von der ganzen bis zur Zweiunddreißigstelnote setzen | staff view |
| `Alt`/`Cmd`+`.`                   | Den Punkt des aktuellen Notenwerts umschalten                       | staff view |
| `O`                               | Eingabemodus Overwrite                                              | staff view |
| `I`                               | Eingabemodus Insert                                                 | staff view |
| `Delete`                          | Die Note oder Pause am Cursor entfernen                             | Beide      |
| `Backspace`                       | Die Note oder Pause vor dem Cursor entfernen                        | Beide      |
| Pfeiltasten                       | Den Cursor zur benachbarten Note, Pause oder Rasterzelle bewegen    | Beide      |

Die grid view arbeitet immer im Modus Overwrite, `O` und `I` haben dort also keine Wirkung. Die Tasten für die Notenlänge gelten nur dort, wo es Längen gibt, also in der staff view.

## Auswahl

- Ein Klick wählt eine Note oder eine Zelle aus; `Shift`+Klick erweitert die Auswahl.
- Ziehen wählt die Elemente aus, die ein Rechteck bedeckt.
- Die Pfeiltasten bewegen den Cursor; sie ersetzen die Auswahl durch das benachbarte Element.
- `Escape` hebt die Auswahl auf, wenn kein Dialog offen ist und der Zen mode aus ist.

## Dialoge und Menüs

- `Escape` schließt den obersten Dialog; ein Dialog, der es erlaubt, schließt auch bei einem Klick außerhalb.
- `Enter` löst die Hauptaktion des Dialogs aus, solange der Fokus nicht in einem Textfeld, einer Auswahlliste oder einer
  Schaltfläche liegt.
- Menüs und Auswahllisten werden mit dem Zeiger bedient; es gibt keine Tastaturnavigation durch ihre Einträge.

## Verwandte Kapitel

- [Bearbeiten in der staff view](../using/staff-editing.md) erklärt die Abläufe hinter den Eingabetasten.
- [Bearbeiten in der grid view](../using/grid-editing.md) behandelt das Raster und die Leiste der note styles.
- [Eine Partitur lesen](../using/presentation.md) beschreibt die Ansichten, zwischen denen `G` und `S` wechseln.
