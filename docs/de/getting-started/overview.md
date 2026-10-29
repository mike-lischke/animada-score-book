# Was Animada Score Book ist

Animada Score Book hält das Repertoire einer Samba-Gruppe an einem Ort und macht es spielbar. Es ist eine Browser-Anwendung mit einem kleinen Backend: Das Backend speichert Scores, Benutzer und Berechtigungen in einer Datenbank, und der Browser stellt sie dar, spielt sie ab und bearbeitet sie.

Alles in der Anwendung ist um eine bateria herum gebaut. Ein Score ist ein rhythmisches Arrangement für mehrere Perkussionsinstrumente, so geschrieben, dass ein Spieler ihm auf dem Bildschirm folgen, es ändern und das Ergebnis im Browser hören kann.

## Was du tun kannst

| Aufgabe                                                                 | Kapitel                                                                            |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Scores in einer Bibliothek durchsuchen und organisieren                 | [Die Score Library](../using/score-library.md)                                        |
| Einen Score als Notenraster oder als Notenschrift lesen                 | [Einen Score lesen](../using/presentation.md)                                         |
| Mit Metronom, Count-in, mixer und Play Focus abspielen                  | [Wiedergabe und Üben](../using/playback.md)                                           |
| Noten, note styles, articulations, subdivisions und dynamics bearbeiten | [Bearbeiten in der staff view](../using/staff-editing.md)                             |
| Einen Score drucken oder als PDF speichern                              | [Drucken, PDF und MP3-Export](../using/printing-and-export.md)                        |
| Die Wiedergabe als MP3-Datei exportieren                                | [Drucken, PDF und MP3-Export](../using/printing-and-export.md)                        |
| Benutzer, Gruppen und Zugriffe administrieren                           | [Benutzer, Gruppen und Berechtigungen](../administration/users-groups-permissions.md) |

## Die Bausteine

Das Handbuch verwendet diese Begriffe durchgängig. Das [Glossar](../reference/glossary.md) definiert jeden davon.

| Begriff          | Bedeutung                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **score**        | Ein Musikstück: sein Titel, seine Taktart, sein Tempo, seine bars und tracks                                                 |
| **track**        | Eine Zeile des Score, gespielt von einem Instrument                                                                          |
| **bar**          | Eine Spalte des Score; bars werden ab 1 gezählt                                                                              |
| **instrument**   | Ein Perkussionsinstrument mit einem festen Satz von note styles, Samples und Symbolen                                        |
| **note style**   | Eine spielbare Variante eines Instruments, etwa `Open`, `Muted` oder `Slap`, die Klang und Symbol zugleich festlegt          |
| **articulation** | Eine an einer Note ergänzte Markierung, etwa `Accent`, `Ghost` oder `Damped`, die die Klangwahl des Instruments nicht ändert |
| **dynamics**     | Lautstärkemarken über mehrere bars hinweg: Crescendo, Decrescendo und Forte                                                  |
| **subdivision**  | Eine Unterteilung einer Position der bar in ein tuplet, zum Beispiel ein Triplet                                             |

Ein Score entsteht über den Dialog `New Song` mit einem Titel, einer Taktart, einer Anzahl bars, einem Tempo in BPM und den Instrumenten, die einen track erhalten. Verfügbar sind die Taktarten 4/4, 6/8, 5/4 und 7/8.

Elf Instrumenttypen stehen zur Verfügung, vom Agogô 2-Bell bis zu den drei Surdos. [Instrument- und Notationsreferenz](../instruments.md) erklärt jedes davon.

## Zwei Ansichten desselben Score

Jeder Score hat zwei Darstellungen:

- Die **grid view** zeigt den Score als Matrix aus bars und tracks. Jede Zelle trägt ein Symbol, was das rhythmische
  Muster leicht lesbar und schnell eingebbar macht.
- Die **staff view** zeigt den Score als Perkussionsnotation mit Schlüssel, Taktart, Notenhälsen, Balken und tuplets. Sie
  ist das, was die meisten Spieler lesen, und was die Druckausgabe enthält.

Beide Ansichten zeigen dieselben Daten, und beide lassen sich bearbeiten. Du kannst jederzeit wechseln, auch während der Wiedergabe, und die Position im Score bleibt erhalten. [Einen Score lesen](../using/presentation.md) erklärt, wann welche Ansicht hilft.

![Notenschrift von Ijexá mit dem Playhead in bar 5](../../images/en/presentation/staff-view.png)

*Animada Score Book zeigt einen Score als Perkussionsnotation während der Wiedergabe; derselbe Score ist als Notenraster verfügbar.*

## Wo deine Daten liegen

Animada Score Book hat zwei Speicherorte, und der Unterschied ist wichtig, wenn du mit einem Score arbeitest:

- **Das Backend und seine Datenbank** halten die Score-Bibliothek, die Benutzerkonten, die Gruppen und die
  Berechtigungen. Derselbe Prozess liefert auch die Anwendung selbst aus, einschließlich der Musikfonts und der
  Klangsamples.
- **Dein Browser** hält den aktuellen Score und deine persönlichen Einstellungen, etwa die gewählte Ansicht, den
  Musikfont, das Farbschema und den Zoom. Ein geöffneter Score übersteht ein Neuladen wegen dieser Kopie, aber sie ist
  nicht die Kopie auf dem Server und auf keinem anderen Gerät verfügbar.

Ein Speichern über `Save Score` schreibt den Score ins Backend, was Schreibzugriff auf diesen Score erfordert. Ohne Schreibzugriff kannst du den Score trotzdem lesen und abspielen, und deine lokale Kopie behält deine eigenen Änderungen, ohne sie zu veröffentlichen.

Das Hosting folgt aus dieser Trennung: Ein Administrator installiert das Backend einmal, und alle anderen brauchen nur einen Browser und die Adresse dieser Installation. In der Entwicklung laufen Backend und Frontend stattdessen als zwei Prozesse; siehe [Entwicklungs-Setup](../development/setup.md).

## Anforderungen

| Bereich    | Anforderung                                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser    | Ein aktueller Browser mit Web Audio, `localStorage` und Unterstützung für ES-Module. Die Testsuite verwendet Chromium.                             |
| MP3        | Der MP3-Export braucht zusätzlich die MP3-Kodierung des Browsers; er ist in Chromium getestet.                                                     |
| Bildschirm | Desktop-, Tablet- und Telefon-Layouts werden unterstützt. Der Zoom ist manuell, von 50 % bis 150 %.                                                |
| Netzwerk   | Der Browser muss das Backend erreichen. HTTPS ist nötig, damit Sitzungen erneuert werden, siehe [Sicherheitshinweise](../administration/security.md). |
| Server     | Node.js und MySQL/MariaDB oder PostgreSQL, installiert wie in [Animada Score Book installieren](../administration/installation.md) beschrieben.       |

## Anonymer Zugriff

Der `Sign In`-Dialog bietet `Continue Anonymously` neben `Log In`. Anonyme Besucher können jeden öffentlich lesbaren Score durchsuchen und abspielen, und die Anwendung hält ihre lokalen Änderungen im Browser. Änderungen an Scores, die ihnen nicht gehören, können sie nicht veröffentlichen.

## Wie es weitergeht

- Neu in der Anwendung? Mach weiter mit [Deine erste Sitzung](first-steps.md).
- Du suchst, wie ein bestimmtes Instrument notiert wird? Siehe [Instrument- und Notationsreferenz](../instruments.md).
- Du richtest einen Server ein? Beginne mit [Animada Score Book installieren](../administration/installation.md).
