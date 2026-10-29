# Entwicklungs-Setup

Dieses Kapitel führt einen Entwickler von einem frischen Clone zu einer laufenden Entwicklungsumgebung mit beiden Prozessen, einer funktionierenden Datenbank und Debugging in VS Code.

## Anforderungen

| Komponente      | Anforderung                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Node.js         | 24.15 oder 26, wie das Feld `engines` angibt; `.nvmrc` nennt 26                                                         |
| Datenbank       | MySQL/MariaDB oder PostgreSQL, vom Rechner aus erreichbar                                                               |
| Git             | Nötig für die branchspezifischen Datenbanknamen, die unten beschrieben sind                                             |
| TLS-Zertifikate | `~/.ssh/localhost-key.pem` und `~/.ssh/localhost-cert.pem`; die Vite-Konfiguration liest beide für den HTTPS-Dev-Server |

## Die lokale Konfigurationsdatei

```bash
npm install
cp backend-config.example.json backend-config.json
```

`backend-config.json` wird von Git ignoriert. Fülle den Datenbankblock für die Engine aus, die du lokal nutzt; [Das Backend konfigurieren](../administration/configuration.md) dokumentiert jeden Schlüssel.

Das Backend startet ohne `JWT_SECRET` nicht. `npm run start-debug` setzt es auf `for-debugging`, was ein lokales Setup braucht. Für alles andere exportiere einen eigenen Wert.

## Die beiden Prozesse starten

Die Entwicklung nutzt zwei Prozesse:

1. **Backend**: `npm run start` (oder `npm run start-debug`), lauscht standardmäßig auf Port 3100. Es protokolliert
   `Backend connected: …` und mit `AUTO_MIGRATE=true` zusätzlich `Branch: …`, die effektive Datenbank und entweder die
   angewendeten Migrationen oder `All migrations already applied.`
2. **Frontend**: `npm run dev`, liefert `https://localhost:5173`. Die Vite-Konfiguration terminiert TLS mit den lokalen
   Zertifikaten und leitet `/api` und `/soundLib` an `http://127.0.0.1:3100` weiter, der Browser spricht also nur HTTPS.

Öffne `https://localhost:5173`. Das Zertifikat ist selbstsigniert, der Browser warnt also einmal; die `Launch`-Konfiguration in VS Code übergibt bereits `--allow-insecure-localhost`.

Der erste Start zeigt den Dialog `Backend Setup`, weil die Datenbank noch keine Tabellen hat; der Start selbst wendet keine Migrationen an. Wähle `Initialize Database`, um das Schema anzulegen. [Animada Score Book installieren](../administration/installation.md) beschreibt den Assistenten.

## Befehle

| Befehl                    | Zweck                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run dev`             | Frontend-Dev-Server auf `https://localhost:5173`                                          |
| `npm run start`           | Backend mit dem konfigurierten `JWT_SECRET` aus der Umgebung                              |
| `npm run start-debug`     | Backend mit `JWT_SECRET="for-debugging"`                                                  |
| `npm run build`           | Voller Produktions-Build: SMuFL-Metriken, Font-Prüfung, Themes, Vite-Build, Bundle-Budget |
| `npm run check`           | TypeScript-Prüfung für `src` und `tests`                                                  |
| `npm run lint`            | ESLint über `src`, `tests` und `build`                                                    |
| `npm run test`            | Vitest-Unit- und -Integrationstests, einmaliger Lauf                                      |
| `npm run test:e2e`        | Playwright gegen den Produktions-Build                                                    |
| `npm run test:e2e:headed` | Dasselbe mit sichtbarem Browser                                                           |
| `npm run test:e2e:ui`     | Dasselbe im UI-Modus von Playwright                                                       |
| `npm run serve:e2e`       | `dist/` auf Port 4173 für manuelle Prüfungen ausliefern                                   |
| `npm run db:migrate`      | Ausstehende Migrationen anwenden, ohne den Server zu starten                              |
| `npm run db:cleanup`      | Branch-Datenbanken melden, deren Branch nicht mehr existiert                              |
| `npm run package`         | Das deployment package bauen (siehe unten)                                                |
| `npm run watch`           | TypeScript-Watcher für den Editor                                                         |

`npm run test:e2e` startet `dist/` selbst, baut die Anwendung also zuerst; der Browser läuft gegen `http://127.0.0.1:4173`, nicht gegen den Dev-Server.

## Datenbanken in der Entwicklung

Das Backend hängt den aktuellen Branch an den Datenbanknamen an — `<name>__<branch>` — und nutzt den konfigurierten Namen unverändert auf `main`, auf `release*`-Branches und unter Vitest. Ein neuer Branch startet daher mit einer leeren Datenbank, und der Assistent läuft erneut.

- `npm run db:migrate` wendet Migrationen für den aktuellen Branch an.
- `npm run db:cleanup` listet verwaiste Branch-Datenbanken und gibt die `DROP DATABASE`-Anweisungen aus.
- `Reset Database` im Setup-Dialog baut die Branch-Datenbank des aktuellen Branch neu auf.

## Bauen

`npm run build` führt mehrere Schritte aus, die alle ins Repository oder nach `dist/` schreiben:

1. `generate:fonts` schreibt SMuFL-Metriken nach `src/generated` und `public/fonts/smufl`.
2. `verify:fonts` prüft, ob die mitgelieferten Fonts zu diesen Metriken passen.
3. `generate-themes` schreibt das DaisyUI-Theme-CSS und die Zuordnung der Theme-Namen.
4. `vite build` bündelt die Anwendung, einschließlich der Prüfung des Bundle-Budgets.

`npm run package` baut das Frontend und das gebündelte Backend und schreibt dann `dist-package/animada-score-book-<version>.tar.gz`. [Animada Score Book installieren](../administration/installation.md) beschreibt das Archiv; [Backup, Restore und Upgrades](../administration/backup-restore-upgrades.md) den Weg des Upgrades.

## Debugging in VS Code

Das Repository bringt zwei Launch-Konfigurationen mit:

- `Launch` öffnet Chrome auf `https://localhost:5173` mit `--allow-insecure-localhost` und führt zuerst die Aufgabe
  `tsc: watch` aus, sodass Breakpoints in TypeScript-Quellen zum laufenden Code passen.
- `Debug Current Test File` führt Vitest für die geöffnete Datei aus, mit unbegrenztem Test-Timeout und angehängtem
  Debugger.

Das Backend debuggt man, indem man `npm run start-debug` in einem Terminal startet; es ist ein normaler Node-Prozess mit `tsx`, eine Node-Launch-Konfiguration mit diesem Befehl funktioniert also ebenso.

## Verwandte Kapitel

- [Architektur und Entscheidungen](architecture.md) kartiert den Code.
- [Diese Dokumentation pflegen](documentation.md) behandelt die Konventionen des Handbuchs.
- [Das Backend konfigurieren](../administration/configuration.md) dokumentiert die Konfigurationsdatei.
