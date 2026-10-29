# Glossar

Das Handbuch verwendet die Bezeichnungen, die die Anwendung zeigt. Diese Seite sammelt sie und die Musikbegriffe, auf die sich die anderen Kapitel stützen.

Instrumentnamen bleiben so, wie die Instrumente in einer bateria heißen; [Instrument- und Notationsreferenz](../instruments.md) erklärt jedes davon im Detail.

## Begriffe der Anwendung

| Begriff                     | Bedeutung                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Score Library**           | Der Drawer, der jeden Score enthält, den ein Benutzer erreichen kann, in Ordnern organisiert                       |
| **score**                   | Ein Musikstück mit seinem Titel, seiner Taktart, seinem Tempo, seinen bars und tracks                              |
| **track**                   | Eine Zeile des Score, gespielt von einem einzigen Instrument                                                       |
| **bar**                     | Eine Spalte des Score; bars werden ab 1 gezählt                                                                    |
| **grid view**               | Die Darstellung als Matrix aus bars und tracks, ein Symbol pro Schritt                                             |
| **staff view**              | Die Darstellung als Perkussionsnotation                                                                            |
| **edit mode**               | Der Zustand, in dem der Score geändert werden kann; der Umschalter im Header liest `Editing`, solange er aktiv ist |
| **note style**              | Eine spielbare Variante eines Instruments, etwa `Center`, `Ghost` oder `Slap`; sie legt Klang und Symbol fest      |
| **playing technique**       | Wie das Instrument angeschlagen wird, zum Beispiel mit einem Stick, einer Hand oder dem Handballen                 |
| **articulation**            | Eine an einer Note ergänzte Markierung — `Accent`, `Ghost` oder `Damped` —, die ihren note style nicht ändert      |
| **dynamics**                | Lautstärkemarken über einen Abschnitt von bars: `Crescendo`, `Decrescendo`, `Forte`                                |
| **subdivision**             | Ein Teil einer bar, der in ein tuplet unterteilt ist                                                               |
| **tuplet**                  | Eine Gruppe von Noten, die eine Dauer in eine andere Anzahl teilt als ihre natürliche                              |
| **one-bar repeat (simile)** | Eine Markierung, die für die vorherige bar desselben track steht                                                   |
| **Play Focus**              | Die bars, auf die die Wiedergabe beschränkt ist; ohne fokussierte bar gilt der ganze Score                         |
| **mixer**                   | Die Lautstärkespalte neben den Namen der tracks                                                                    |
| **focus**                   | Ein Pegel eines track über 100 %, der einen track verstärkt und die anderen absenkt                                |
| **mute**                    | Ein Pegel eines track von 0 %                                                                                      |
| **Zen mode**                | Das reduzierte Layout, das Header und mode bar um den Score herum ausblendet                                       |
| **Settings**                | Der Dialog mit Musikfont, Farbschema, Zoom und den weiteren Anzeigeoptionen                                        |
| **music font**              | Der SMuFL-Font, der Noten, Pausen, Schlüssel und Taktstriche zeichnet                                              |
| **color theme**             | Die Farbpalette der Oberfläche                                                                                     |
| **score navigator**         | Der Streifen im Footer, der den sichtbaren Bereich zeigt und verschiebt                                            |
| **notification center**     | Die Nachrichtenhistorie hinter der Glocke im Footer                                                                |
| **Group Access**            | Der Editor, der Lese- und Schreibzugriff auf einen Ordner oder einen Score vergibt                                 |
| **read** / **write**        | Die beiden Berechtigungsstufen; `write` schließt `read` immer ein                                                  |
| **Admins**                  | Die Gruppe, deren Mitglieder die Installation administrieren dürfen                                                |
| **World**                   | Die Gruppe, zu der jeder Benutzer und jeder anonyme Besucher gehört                                                |
| **backend**                 | Der Node.js-Prozess mit der Datenbank, der die Anwendung ausliefert                                                |
| **database**                | MySQL/MariaDB oder PostgreSQL mit Bibliothek, Konten und Berechtigungen                                            |
| **deployment package**      | Das Archiv, das ein Administrator entpackt und mit `node server.js` startet                                        |

## Musikbegriffe

| Begriff                | Bedeutung                                                                      |
| ---------------------- | ------------------------------------------------------------------------------ |
| **percussion clef**    | Der Schlüssel am Anfang eines Perkussionssystems                               |
| **time signature**     | Die Taktart eines Score; die Anwendung bietet 4/4, 6/8, 5/4 und 7/8            |
| **tempo**              | Das Tempo in Schlägen pro Minute (BPM)                                         |
| **whole note**         | Eine Note, die in 4/4 eine ganze bar dauert                                    |
| **half note**          | Die Hälfte einer whole note                                                    |
| **quarter note**       | Ein Viertel einer whole note; der Schlag in 4/4                                |
| **eighth note**        | Die Hälfte einer quarter note                                                  |
| **sixteenth note**     | Die Hälfte einer eighth note                                                   |
| **thirty-second note** | Die Hälfte einer sixteenth note; der kürzeste Wert, den die Anwendung bietet   |
| **dotted note**        | Eine Note, die um die Hälfte ihres eigenen Werts verlängert ist                |
| **rest**               | Eine Pause mit einem eigenen Notenwert                                         |
| **whole-bar rest**     | Eine Pause, die eine leere bar füllt                                           |
| **stem**               | Der senkrechte Strich am Notenkopf                                             |
| **beam**               | Der Balken, der mehrere kurze Noten zu einer Gruppe verbindet                  |
| **flag**               | Das Fähnchen am Hals einer einzelnen kurzen Note                               |
| **duplet**             | Ein tuplet, das zwei Noten in der Zeit von drei spielt                         |
| **triplet**            | Ein tuplet, das drei Noten in der Zeit von zwei spielt                         |
| **quadruplet**         | Ein tuplet, das vier Noten in der Zeit von drei spielt                         |
| **quintuplet**         | Ein tuplet, das fünf Noten in der Zeit von vier spielt                         |
| **sextuplet**          | Ein tuplet, das sechs Noten in der Zeit von vier spielt                        |
| **septuplet**          | Ein tuplet, das sieben Noten in der Zeit von vier spielt                       |
| **octuplet**           | Ein tuplet, das acht Noten in der Zeit von sechs spielt                        |
| **nontuplet**          | Ein tuplet, das neun Noten in der Zeit von acht spielt                         |
| **accent**             | Eine Markierung, die eine Note stärker klingen lässt                           |
| **ghost note**         | Ein leichter Anschlag, in Klammern geschrieben                                 |
| **damped**             | Ein Anschlag, dessen Klang mit der Hand gestoppt wird                          |
| **crescendo**          | Ein allmähliches Ansteigen der Lautstärke                                      |
| **decrescendo**        | Ein allmähliches Absinken der Lautstärke                                       |
| **forte**              | Ein plötzlich lauter Pegel                                                     |
| **repeat barlines**    | Ein Paar Taktstriche, das die Wiedergabe die bars dazwischen wiederholen lässt |
| **simile**             | Das Zeichen, das für die vorherige bar steht                                   |

## Samba-Praxis

| Begriff                       | Bedeutung                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| **bateria**                   | Die Perkussionssektion einer Samba-Gruppe und die Gruppe der Instrumente, die sie spielt |
| **Agogô 2-Bell**              | Die Doppelglocke, mit einem Stick geschlagen; auf zwei Systemlinien notiert              |
| **Agogô 4-Bell**              | Das Agogô mit vier Glocken, auf vier Systemlinien notiert                                |
| **Chocalho**                  | Der Shaker, mit einer Schüttelbewegung gespielt                                          |
| **Tamborim**                  | Die kleine Rahmentrommel, mit einem Stick gespielt                                       |
| **Repinique**                 | Die Leittrommel, mit einem Stick und mit der Hand gespielt                               |
| **Repinique (Whippy Sticks)** | Dieselbe Trommel, mit flexiblen Whippy Sticks gespielt                                   |
| **Caixa**                     | Die Snare Drum                                                                           |
| **Timbau**                    | Die Handtrommel, mit Open-, Slap- und Bass-Anschlag gespielt                             |
| **Surdo Terceira**            | Der höchste der drei Surdos                                                              |
| **Surdo Segunda**             | Der mittlere Surdo                                                                       |
| **Surdo Primeira**            | Der tiefste Surdo, der den Puls trägt                                                    |

## Verwandte Kapitel

- [Was Animada Score Book ist](../getting-started/overview.md) führt die Begriffe im Zusammenhang ein.
- [Instrument- und Notationsreferenz](../instruments.md) beschreibt jedes Instrument und seine note styles.
