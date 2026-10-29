# Handbuch zu Animada Score Book

Animada Score Book ist eine browserbasierte Score-Bibliothek und Wiedergabe-Anwendung für Samba-Gruppen. Sie speichert dein Repertoire, zeigt jeden Score als Notenraster oder als Notenschrift, spielt ihn mit einem mixer pro track ab und druckt oder exportiert ihn. Dieses Handbuch dokumentiert Version 2.0.1.

Dies ist die deutsche Ausgabe. Maßgeblich bleibt das [englische Handbuch](../en/index.md): Es wird zuerst aktualisiert, und die Anwendung selbst ist durchgehend englisch, sodass Fachbegriffe wie score, track, bar, grid view, staff view und note style auch hier englisch bleiben. Alle Beschriftungen, Tooltips und Meldungen der Oberfläche werden unverändert zitiert.

Wähle den Weg, der zu deiner Rolle passt:

| Zielgruppe      | Hier starten                                                      |
| --------------- | ----------------------------------------------------------------- |
| Musiker         | [Deine erste Sitzung](getting-started/first-steps.md)             |
| Administratoren | [Animada Score Book installieren](administration/installation.md) |
| Entwickler      | [Entwicklungs-Setup](development/setup.md)                        |

## Erste Schritte

| Kapitel                                                   | Inhalt                                                                                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [Was Animada Score Book ist](getting-started/overview.md) | Die Produktidee, die im Handbuch verwendeten Begriffe, Anforderungen an Browser und Gerät und wie der anonyme Zugriff funktioniert |
| [Deine erste Sitzung](getting-started/first-steps.md)     | Anmelden, einen Score öffnen, Wiedergabe, Ansichten wechseln, Zoom, Zen mode, Speichern und wo die Settings liegen                 |

## Die Anwendung benutzen

| Kapitel                                                     | Inhalt                                                                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [Die Score Library](using/score-library.md)                 | Den Baum der Bibliothek durchsuchen, Ordner und Scores anlegen, importieren, öffnen, teilen und Berechtigungen                         |
| [Einen Score lesen](using/presentation.md)                  | grid view und staff view, Musikfonts, Farbschemata, Zoom, der score navigator, Zen mode, Telefone und Tablets, das notification center |
| [Bearbeiten in der staff view](using/staff-editing.md)      | Noteneingabe, Notenwerte, Pausen, note styles, articulations, subdivisions und tuplets, Auswahl, Clipboard, Undo und Redo              |
| [Bearbeiten in der grid view](using/grid-editing.md)        | Das Rastermodell, Noteneingabe, note styles, Auswahlen und die Unterschiede zum Bearbeiten in der staff view                           |
| [Wiedergabe und Üben](using/playback.md)                    | Transport, Tempo, mixer, Metronom, Count-in, Play Focus, Looping, der Playhead und das Vorhören von Noten                              |
| [Drucken, PDF und MP3-Export](using/printing-and-export.md) | Die print preview, Layout-Steuerelemente, PDF-Ausgabe des Browsers und der MP3-Export                                                  |

## Instrument- und Notationsreferenz

| Kapitel                                             | Inhalt                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [Instrument- und Notationsreferenz](instruments.md) | Notationsgrundlagen plus ein Abschnitt pro Instrumenttyp: note styles, Platz im System, articulations |

## Administration

| Kapitel                                                                            | Inhalt                                                                                              |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Animada Score Book installieren](administration/installation.md)                  | Anforderungen, deployment package, Vorbereitung der Datenbank, erster Start, HTTPS und Upgrades     |
| [Das Backend konfigurieren](administration/configuration.md)                       | Jeder Konfigurationsschlüssel und jede Umgebungsvariable mit Standardwert und Wirkung               |
| [Benutzer, Gruppen und Berechtigungen](administration/users-groups-permissions.md) | Konten, Gruppen, Gruppen-Login, Eigentum, Lese- und Schreibzugriff und der Group Access-Editor      |
| [Sicherheitshinweise](administration/security.md)                                  | Passwortspeicherung, Sitzungen, Brute-Force-Begrenzung, Score-Locks und eine Checkliste zur Härtung |
| [Backup, Restore und Upgrades](administration/backup-restore-upgrades.md)          | Was wo liegt, Verfahren für Backup und Restore, Migrationen und Upgrades                            |

## Referenz

| Kapitel                                                           | Inhalt                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Tastaturkürzel](reference/keyboard-shortcuts.md)                 | Globale Kürzel, Tasten der Noteneingabe, Modifikatoren der Auswahl und Tasten in Dialogen |
| [Glossar](reference/glossary.md)                                  | Begriffe der Anwendung, Musikbegriffe und die Instrumente einer bateria                   |
| [Fehlerbehebung und bekannte Einschränkungen](troubleshooting.md) | Häufige Probleme mit ihrer Ursache und die für 2.0.1 dokumentierten Einschränkungen       |

## Entwicklung

| Kapitel                                                       | Inhalt                                                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Entwicklungs-Setup](development/setup.md)                    | Anforderungen, Konfiguration, Dev-Server, Start des Backends, Testbefehle und Debugging                    |
| [Architektur und Entscheidungen](development/architecture.md) | Eine kurze Karte des Codes mit Verweisen auf die Architecture Decisions und Design Contracts               |
| [Diese Dokumentation pflegen](development/documentation.md)   | Konventionen für Seiten und Bilder, die Übergabe an die Website und was sich mit jedem Release ändern muss |

## Verwandte Dokumente

- [README](../../readme.md) — Produktübersicht, Einstieg in die Installation und Verweise auf dieses Handbuch
- [Release notes](../../release-notes.md) — was sich in jeder veröffentlichten Version geändert hat
- [Architecture decision records](../adr/readme.md) — die dauerhaften Entscheidungen hinter der Implementierung (nur im Repository, nicht Teil des deployment package)
- [Lizenz](../../License.txt)

## Ausgaben und Sprachen

Die englische Ausgabe in `docs/en/` ist maßgeblich. Diese deutsche Ausgabe in `docs/de/` spiegelt sie mit derselben Kapitelstruktur und Lesereihenfolge; übersetzt ist die erklärende Prosa, während Fachbegriffe und alle Strings der Anwendung englisch bleiben. Ändert sich die englische Quelle, werden nur die betroffenen deutschen Kapitel nachgezogen. Das deployment package enthält ausschließlich die englische Ausgabe; weitere Sprachen werden nicht mit ausgeliefert, sondern nur von der Website aus diesem Repository geladen. Eine veröffentlichte HTML-Ausgabe ist in einem separaten Website-Projekt geplant; bis dahin sind diese Markdown-Seiten die Referenz.
