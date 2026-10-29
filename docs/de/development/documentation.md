# Diese Dokumentation pflegen

Das Handbuch wird in diesem Repository bearbeitet und nirgendwo sonst. Dieses Kapitel beschreibt, wohin eine Seite gehört, wie sie geschrieben wird und was sich ändern muss, wenn sich die Anwendung ändert.

## Wo das Handbuch liegt

`docs/en/` ist die maßgebliche Ausgabe, `docs/de/` die deutsche Übersetzung mit denselben Dateinamen und derselben Lesereihenfolge:

| Verzeichnis                                            | Inhalt                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| `docs/en/index.md`                                     | Inhaltsseite; ihre Tabellen legen die Lesereihenfolge fest |
| `docs/en/getting-started/`                             | Was die Anwendung ist und eine erste Sitzung               |
| `docs/en/using/`                                       | Bibliothek, Darstellung, Bearbeiten, Wiedergabe, Drucken   |
| `docs/en/administration/`                              | Installation, Konfiguration, Benutzer, Sicherheit, Backups |
| `docs/en/reference/`                                   | Tastaturkürzel und Glossar                                 |
| `docs/en/development/`                                 | Dieses Kapitel und seine Nachbarn                          |
| `docs/en/instruments.md`, `docs/en/troubleshooting.md` | Einzelseiten mit fester Überschriftsstruktur               |
| `docs/images/`                                         | Screenshots und Notationsausschnitte                       |
| `docs/adr/`, `docs/design/`                            | Architecture Decisions und Design Contracts                |
| `readme.md`                                            | Produktübersicht, Einstiegspunkte und Showcase-Bilder      |

Weitere Sprachverzeichnisse wie `docs/pt/` sind für Übersetzungen reserviert und entstehen erst, wenn eine Übersetzung existiert.

## Konventionen für Seiten

- Eine H1 pro Seite, entnommen aus dem Titel der Seite in `docs/en/index.md`.
- Überschriftenebenen beginnen im Seitentext bei H2; die Instrumentabschnitte in `docs/en/instruments.md` behalten ihre
  festen Namen, weil andere Seiten und die Website darauf verlinken.
- Links sind relativ und beginnen nie mit einem Schrägstrich; Bilder werden genauso referenziert. Absolute
  Repository-URLs brechen Forks und Static-Site-Builds.
- Begriffe folgen der Oberfläche: **Score Library**, `score`, `track`, `bar`, `grid view`, `staff view`, `Zen mode`,
  `note style`. Das [Glossar](../reference/glossary.md) definiert alle davon, und die Instrumentnamen bleiben so, wie
  eine bateria sie verwendet.
- UI-Beschriftungen erscheinen in Backticks, genau wie die Anwendung sie schreibt, zum Beispiel `Save Score` oder
  `Group Access`.
- Englisch als Quellsprache. Die Strings der Oberfläche bleiben auch in der deutschen Ausgabe englisch, und Fachbegriffe
  werden nicht eingedeutscht.

## Bilder

[Image conventions](../../images/README.md) enthält das Verzeichnislayout, die Dateibenennung, die Capture-Einstellungen, Größenlimits und die Regeln für Alt-Text. Kurz gesagt:

- `docs/images/en/<topic>/` für Screenshots mit englischer Oberfläche, `docs/images/notation/` für Notationsausschnitte
  ohne Oberflächentext.
- Dateinamen tragen kein Datum und keine Version, ein neues Capture ersetzt also die Datei.
- Ein Bild wird zusammen mit dem Text hinzugefügt, der es verwendet, und neu aufgenommen, wenn sich die gezeigte
  Oberfläche ändert.
- Die deutsche Ausgabe verwendet dieselben Bilder; übersetzt werden nur Alt-Text und Bildunterschrift.

## Die veröffentlichte Website

Ein separates Projekt veröffentlicht das Handbuch; dieses Repository bleibt die einzige Quelle. Die Anforderungen für das Konsumieren einer Version — gepinnter Tag oder Commit, Navigation aus `docs/en/index.md`, Sprachauswahl, Suchumfang, Basispfade und Link-Validierung — sind in `docs/planning/handbook-2.0/website-handoff.md` festgehalten, das selbst nicht veröffentlicht wird.

Aus dieser Trennung folgen zwei Regeln:

- Korrekturen gehen in dieses Repository, nie in eine Kopie im Website-Projekt.
- Die Website konsumiert eine veröffentlichte Version, Dokumentationsänderungen erreichen sie also mit dem nächsten
  Release, nicht dazwischen.

Ausgeliefert wird nur die englische Ausgabe: Das deployment package enthält `docs/en/` und `docs/images/`, weitere Sprachfassungen wie `docs/de/` lädt die Website aus dem Repository.

## Die Dokumentation für ein Release aktualisieren

1. Gehe die geänderten Funktionen gegen die betroffenen Kapitel durch; die Coverage-Checkliste in
   `docs/planning/handbook-2.0/` nennt für jede Funktion ein Ziel.
2. Aktualisiere die betroffenen Seiten und nimm die Screenshots neu auf, die geänderte Oberflächenteile zeigen.
3. Nimm die versionsabhängigen Bilder für ein Major- oder Minor-Release neu auf: Jedes Capture, dessen Bild den Footer
   zeigt, trägt die Version der Anwendung in den Pixeln, und der Release-Notes-Dialog zeigt den neuesten Eintrag. Die
   Liste ist die Tabelle im [Storyboard](../../planning/handbook-2.0/screenshot-storyboard.md#version-dependent-captures).
   Ein Patch-Release behält die vorhandenen Captures, bis zum nächsten Major- oder Minor-Release zeigen sie also die
   Version, die jenes Release trug.
4. Suche in `readme.md`, `docs/` und `release-notes.md` nach der vorherigen Versionsnummer; Text, der sie zitiert, muss
   sich ebenfalls ändern.
5. Aktualisiere `readme.md`, wenn sich die Funktionsübersicht, ein Einstiegspunkt oder ein Showcase-Bild geändert hat. Es
   verlinkt in dieses Handbuch und wiederholt keinen Kapitelinhalt.
6. Prüfe die Tabelle der [bekannten Einschränkungen](../troubleshooting.md): Entfernte Einschränkungen verlassen die
   Tabelle, neue kommen hinein.
7. Verlinke neue Decision Records aus [Architektur und Entscheidungen](architecture.md), wenn eine Änderung einen
   eingeführt hat.
8. Schreibe die Release Notes in `release-notes.md`, getrennt vom Handbuch.
9. Prüfe die Links und Bildreferenzen von `docs/en/` und `readme.md`, bevor du das Release taggst.
10. Übergib den Release-Tag an das Website-Projekt.

Die deutsche Ausgabe wird nachgezogen, sobald die englische Quelle steht: Übersetzt werden nur die geänderten Kapitel, und maßgeblich bleibt der englische Text.

## Verwandte Kapitel

- [Architektur und Entscheidungen](architecture.md) erklärt den Code, den die Dokumentation beschreibt.
- [Glossar](../reference/glossary.md) enthält die Terminologie, auf die sich dieses Kapitel bezieht.
- [Animada Score Book installieren](../administration/installation.md) zeigt, wie das Handbuch in eine Installation gelangt.
