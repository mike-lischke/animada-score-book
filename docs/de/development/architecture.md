# Architektur und Entscheidungen

Dieses Kapitel kartiert den Code. Die Begründung dahinter liegt in den [Architecture Decision Records](../../adr/readme.md) und den [Design Contracts](../../design/app-layout-contract.md); diese Seite zeigt darauf, statt sie zu wiederholen. Beide bleiben im Repository und sind nicht Teil des deployment package.

## Aufbau des Repositories

| Verzeichnis                     | Inhalt                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/core/`                     | Domänenmodell: `ScoreBookDataModel`, `Arrangement`, `Track`, `Instrument`, Timing und measure layout, Clipboard, Undo-Historie |
| `src/core/serialisation/`       | Snapshot-Formate, Packen für URL und Speicher, Migration älterer Arrangements                                                  |
| `src/player/`                   | Wiedergabe-Engine: `ArrangementPlayer`, `TrackPlayer`, Metronom, Zeitkoordination                                              |
| `src/supplement/`               | Hilfsmittel: der typisierte Event-Bus, Escape-Stack, Semaphore, MP3-Export                                                     |
| `src/components/ui/`            | Feature-Komponenten: Arrangement, Takte (englisch: bar) in beiden Ansichten, Noten, tracks, Header, Footer, Bibliothek, Druck  |
| `src/components/ui/framework/`  | Die eigene UI-Komponentenbibliothek: Basisklasse, Container, Dialog, Menü, Tree Grid, Tab View, Popup                          |
| `src/ui/`                       | Top-Level-Module: Score Library, Settings, Login, Auswahl- und Modus-Manager, Editoren                                         |
| `src/server/`                   | Backend: Einstiegspunkt, Router, Authentifizierung, Partitur- und Admin-Routen, statische Dateien, Datenbankadapter            |
| `src/assets/`, `src/generated/` | Icons und Instrumentenbilder; generierte Font-Metriken und Theme-CSS                                                           |
| `build/`                        | Build- und Wartungsskripte: Font-Metriken, Themes, Migrationen, Packaging, Seed-Daten                                          |
| `migrations/`                   | Das Datenbankschema als geordnete SQL-Dateien                                                                                  |
| `public/`                       | Musikfonts, Klangsamples, Logo, hochgeladene Dateien                                                                           |
| `tests/`                        | Unit-, Komponenten-, Player-, Server-, Integrations- und Playwright-Tests                                                      |

## Die Anwendung

`src/App.tsx` mountet die Anwendung und besitzt die langlebigen Objekte: das Datenmodell, den Arrangement-Player, den Undo-Manager und die Manager für Auswahl und Modi. Sie führt außerdem die Zustandsmaschine des Starts — Prüfen, Datenbank-Setup, Administrator-Setup, Login, Betrieb — und wechselt zwischen Splash-Dialogen und dem Hauptlayout.

Drei Muster erklären den größten Teil des Codes:

- **Ein Datenmodell, ein Mutationssignal.** Jede Änderung läuft durch `ScoreBookDataModel` oder die Objekte, an die es
  delegiert, und jede Änderung feuert einmal `arrangementMutated`. Der Undo-Manager hört auf dieses Signal und zeichnet
  einen Snapshot pro Änderung auf, weshalb eine Änderung ein Undo-Schritt ist.
- **Requisitions statt direkter Aufrufe.** Die Kommunikation zwischen Komponenten läuft über einen typisierten Event-Bus
  (`src/supplement/Requisitions.ts`). Komponenten registrieren sich für Themen wie `settingsChanged`,
  `playerStateChanged` oder `selectionChanged`, statt Referenzen aufeinander zu halten.
- **Eine Ansicht, zwei Darstellungen.** grid view und staff view rendern dieselbe Partitur (englisch: score), und jede hat ihren eigenen
  measure editor. Beide implementieren denselben Vertrag für Hit-Testing, Auswahl und Tastatureingabe funktionieren
  also in beiden Ansichten.

Die Oberfläche baut auf einer eigenen Komponentenbibliothek (`src/components/ui/framework/`). Alle Komponenten leiten von `UIComponent` ab, Layouts nutzen `Container`, und die Styles liegen in SCSS-Dateien pro Komponente, die ein zentraler Index sammelt.

## Die Wiedergabe-Engine

Die Wiedergabe plant Audio gegen die Uhr des `AudioContext` mit einer Look-ahead-Schleife statt mit Timern pro Note (ADR-0001). `ArrangementPlayer` besitzt den Transport und koordiniert einen `TrackPlayer` pro track plus das Metronom; `TimeCoordinator` rechnet zwischen Partiturzeit und Echtzeit für Playhead, Loop und den Play Focus-Bereich um. Wiederholungstaktstriche werden vor der Wiedergabe aufgelöst, die gespielte Reihenfolge unterscheidet sich also von der geschriebenen (ADR-0017).

## Das Backend

- `backend.ts` lädt die Konfiguration, führt Migrationen aus, initialisiert die Adapter und startet den HTTP-Server.
- `Router.ts` verteilt anhand eines flachen `?action=`-Parameters und leitet an `AuthRoutes`, `ScoreRoutes`,
  `AdminRoutes` oder `StaticRoutes` weiter.
- `Auth.ts` enthält das Berechtigungsmodell und die Token-Behandlung; `RequestContext.ts` stellt Anfrage-Parsing, CORS,
  Proxy Trust, Rate Limiting und das Refresh-Cookie bereit.
- `mysql-adapter.ts` und `postgres-adapter.ts` implementieren ein Adapter-Interface. Das Schema selbst liegt in
  `migrations/`, nicht in den Adaptern.

## Entscheidungen

Der [Index der Decision Records](../../adr/readme.md) listet jede akzeptierte Entscheidung mit einem Hinweis „relevant when“. Die, denen ein Mitwirkender zuerst begegnet, sind:

- [ADR-0001](../../adr/0001-look-ahead-scheduling-web-audio-clock.md) — Planung gegen die Audio-Uhr
- [ADR-0004](../../adr/0004-requisitions-for-cross-module-state.md) — Requisitions als Kanal für Zustand
- [ADR-0005](../../adr/0005-per-view-measure-editors.md) und [ADR-0012](../../adr/0012-execute-input-through-active-measure-editor.md) — Editoren pro Ansicht und Weiterleitung der Eingabe
- [ADR-0009](../../adr/0009-measure-widths-and-staff-window.md) — measure widths und das gerenderte Fenster
- [ADR-0014](../../adr/0014-smulf-font-for-standard-score-symbols.md) — SMuFL-Fonts für Partitursymbole
- [ADR-0020](../../adr/0020-single-mutation-and-measure-layout-signals.md) — ein Mutationssignal pro Änderung

Zwei Design Contracts dokumentieren Vereinbarungen statt Entscheidungen:

- [App layout contract](../../design/app-layout-contract.md) beschreibt die Flächen und die Wortwahl, der das Layout folgt.
  Er ist ein Entwicklerdokument und keine Beschreibung alles dessen, was die Anwendung tut.
- [Build output contract](../../design/build-output-contract.md) beschreibt die Aufteilung in Chunks, das Lazy Loading
  und das Bundle-Budget.

## Tests

| Verzeichnis          | Inhalt                                                           |
| -------------------- | ---------------------------------------------------------------- |
| `tests/core/`        | Domänenmodell, Serialisierung, Migrationen                       |
| `tests/ui/`          | Komponenten- und Interaktionstests mit `@testing-library/preact` |
| `tests/player/`      | Wiedergabe-Engine und Timing                                     |
| `tests/server/`      | Einheiten für Authentifizierung und Migrationen                  |
| `tests/integration/` | Tests über Schichten hinweg, etwa Font-Metriken                  |
| `tests/e2e/`         | Playwright-Specs gegen den Produktions-Build                     |

`npm run test` führt alles außer den Playwright-Specs aus. `npm run test:e2e` baut die Anwendung und liefert sie auf `http://127.0.0.1:4173` aus, End-to-End-Tests laufen also nie gegen den Dev-Server.

## Verwandte Kapitel

- [Entwicklungs-Setup](setup.md) erklärt die Befehle und die beiden Prozesse.
- [Diese Dokumentation pflegen](documentation.md) behandelt die Konventionen des Handbuchs.
- [Architecture Decision Records](../../adr/readme.md) enthalten die Begründung hinter den Entscheidungen oben.
