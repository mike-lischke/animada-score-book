# Das Backend konfigurieren

Das Backend liest eine Datei, `backend-config.json`, aus dem Verzeichnis, in dem es gestartet wird. Umgebungsvariablen überschreiben die Datei, was einem Dienstmanager erlaubt, Geheimnisse aus ihr herauszuhalten. Nichts sonst enthält Einstellungen des Backends.

## Die Konfigurationsdatei

| Schlüssel           | Standard        | Wirkung                                                                                |
| ------------------- | --------------- | -------------------------------------------------------------------------------------- |
| `host`              | `0.0.0.0`       | Interface, an dem der Prozess lauscht                                                  |
| `port`              | `3100`          | Port, an dem er lauscht                                                                |
| `database.engine`   | `mysql`         | Eines von `mysql`, `mariadb`, `postgres`                                               |
| `database.host`     | leer            | Datenbankserver                                                                        |
| `database.port`     | `0`             | Datenbankport; ausdrücklich setzen (`3306` für MySQL/MariaDB, `5432` für PostgreSQL)   |
| `database.database` | leer            | Datenbankname                                                                          |
| `database.user`     | leer            | Datenbankkonto                                                                         |
| `database.password` | leer            | Passwort dieses Kontos                                                                 |
| `soundLibPath`      | `public/sounds` | Verzeichnis, das als Klangbibliothek ausgeliefert wird, relativ zum Arbeitsverzeichnis |
| `allowedOrigins`    | keiner          | Origins, die CORS-Header erhalten                                                      |
| `trustProxy`        | `false`         | Ob weitergeleiteten Headern eines Proxys getraut wird                                  |
| `autoMigrate`       | `false`         | Ob der Start ausstehende Migrationen anwendet, statt sie dem Dialog zu überlassen      |

Die Beispieldatei `backend-config.example.json` im Paket listet alle mit diesen Standardwerten. Kopiere sie und passe den Datenbankblock an; das [Installationskapitel](installation.md) zeigt eine minimale Konfiguration.

Der Installationsdialog im Browser zeigt diese Werte nur an. Sie zu ändern bedeutet, die Datei zu bearbeiten und den Prozess neu zu starten.

## Umgebungsvariablen

Alle Werte außer `soundLibPath` lassen sich aus der Umgebung überschreiben. Die Umgebung gewinnt gegen die Datei, und nicht gesetzte Variablen fallen auf die Datei und dann auf den Standard zurück.

| Variable          | Überschreibt        | Hinweise                                                    |
| ----------------- | ------------------- | ----------------------------------------------------------- |
| `HOST`            | `host`              | Zu bindendes Interface                                      |
| `PORT`            | `port`              | Port, als Zahl                                              |
| `ALLOWED_ORIGINS` | `allowedOrigins`    | Kommagetrennte Liste, umgebende Leerzeichen werden entfernt |
| `TRUST_PROXY`     | `trustProxy`        | Nur der Wert `true` aktiviert es                            |
| `DB_ENGINE`       | `database.engine`   | Ignoriert, wenn es keiner der drei bekannten Engines ist    |
| `DB_HOST`         | `database.host`     |                                                             |
| `DB_PORT`         | `database.port`     | Als Zahl                                                    |
| `DB_NAME`         | `database.database` |                                                             |
| `DB_USER`         | `database.user`     |                                                             |
| `DB_PASSWORD`     | `database.password` |                                                             |
| `JWT_SECRET`      | —                   | Erforderlich; siehe unten                                   |
| `AUTO_MIGRATE`    | `autoMigrate`       | `true` wendet beim Start Migrationen an                     |

## Das JWT-Secret

`JWT_SECRET` hat absichtlich kein Gegenstück in der Konfigurationsdatei: Es ist der Schlüssel, der jedes Sitzungstoken signiert, und das Backend startet ohne ihn nicht. Stelle ihn über den Dienstmanager bereit, zum Beispiel `JWT_SECRET="<long random value>" node server.js`.

Wird das Secret ersetzt, werden alle Token ungültig, die mit dem alten ausgestellt wurden, jeder Benutzer muss sich also neu anmelden. [Sicherheitshinweise](security.md) erklärt Token, Laufzeiten und das Cookie zur Sitzungserneuerung.

## Datenbankeinstellungen

- `engine` wählt den Adapter. `mysql` und `mariadb` teilen einen Adapter; `postgres` nutzt den anderen.
- `host`, `port`, `database`, `user` und `password` werden unverändert an diesen Adapter übergeben, die Datenbank muss
  also bereits existieren, zusammen mit einem Konto, das Tabellen, Indizes und Fremdschlüssel darin anlegen darf.
- Beim Start prüft das Backend die Verbindung. Gelingt sie, protokolliert es
  `Backend connected: <engine> @ <host>:<port>/<database>`; mit `"autoMigrate": true` wendet es stattdessen die
  ausstehenden Migrationen an und protokolliert `Backend initialised: …`. Scheitert die Verbindung, protokolliert es
  `Could not auto-connect: …` und `Waiting for setup from frontend…`, lauscht weiter, und der Browser meldet, dass die
  Datenbank nicht erreichbar ist.
- Ohne `autoMigrate` bleibt eine Datenbank ohne die Anwendungstabellen leer, bis jemand im Browser
  `Initialize Database` wählt, was die Migrationen anwendet und die Demodaten einspielt.

Die Datenbank lässt sich jederzeit aus dem Schema neu aufbauen; [Backup, Restore und Upgrades](backup-restore-upgrades.md) behandelt das.

## Getrennte Datenbanken pro Branch in der Entwicklung

In einem Checkout nutzt das Backend nicht immer den konfigurierten Datenbanknamen:

- Auf `main` und auf Branches, die mit `release` beginnen, nutzt es `database.database` wie konfiguriert.
- Auf jedem anderen Branch hängt es den Branchnamen an: `<name>__<branch>`, wobei Zeichen außerhalb von `a-z`, `A-Z`,
  `0-9`, `_` und `-` durch `_` ersetzt werden.
- Unter Vitest wird der konfigurierte Name unverändert verwendet.

Das hält experimentelle Daten von der echten Datenbank fern. `npm run db:cleanup` sucht nach Datenbanken, deren Branch nicht mehr existiert, und meldet sie.

## Allowed Origins

`allowedOrigins` ist standardmäßig leer, und eine leere Liste sendet überhaupt keine CORS-Header. Füge die Origins hinzu, die ein separates Frontend oder ein Werkzeug nutzen darf:

```json
"allowedOrigins": ["https://scores.example.org", "http://localhost:5173"]
```

Für ein passendes `Origin` gibt das Backend es in `Access-Control-Allow-Origin` zurück, ergänzt `Vary: Origin` und erlaubt die Methoden `GET`, `POST`, `PUT`, `DELETE` und `OPTIONS` mit den Headern `Content-Type` und `Authorization`. Anfragen ohne `Origin`-Header sind nicht betroffen.

Die Anwendung selbst wird vom eigenen Origin des Backends ausgeliefert, braucht hier also keinen Eintrag.

## Proxy Trust

`trustProxy` bleibt `false`, solange das Backend nicht hinter etwas steht, das TLS terminiert und die ursprüngliche Anfrage weiterreicht:

- Mit `false` nutzt das Backend die Adresse der Verbindung als Client-IP und ignoriert `X-Forwarded-For` und
  `X-Forwarded-Proto`.
- Mit `true` liest es diese Header.

Die Client-IP erreicht den Brute-Force-Limiter und das Login-Audit, das Aktivieren hinter einem vertrauenswürdigen Proxy hält diese Aufzeichnungen also korrekt. Ohne Proxy davor würde es einem Client erlauben, eine beliebige Adresse zu behaupten.

## Statische Dateien und die Klangbibliothek

Das Backend liefert die Anwendung und ihre Assets selbst aus:

- `dist/` enthält die gebaute Browser-Anwendung. Anfragen ohne passende Datei fallen auf `dist/index.html` zurück,
  damit Links in die Anwendung funktionieren.
- `public/` wird unverändert ausgeliefert, einschließlich der Musikfonts und der hochgeladenen Instrumentenbilder
  unterhalb von `public/uploads/instruments`. Das Backend legt dieses Verzeichnis beim Start an, wenn es fehlt.
- `soundLibPath` wird gegen das Arbeitsverzeichnis aufgelöst und unter `/soundLib/` ausgeliefert. Der Standard zeigt auf
  die Samples, die das Paket mitbringt; zeige ihn woandershin, um eine andere Klangbibliothek zu nutzen.

## Verwandte Kapitel

- [Animada Score Book installieren](installation.md) legt die Installation an und startet sie.
- [Sicherheitshinweise](security.md) behandelt das JWT-Secret, Token und Härtung.
- [Entwicklungs-Setup](../development/setup.md) erklärt die Konfiguration in der Entwicklung, einschließlich der
  Branch-Datenbanken.
