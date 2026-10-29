# Animada Score Book installieren

Eine Installation besteht aus zwei Teilen: einem Node.js-Backend mit einer Datenbank und der Browser-Anwendung, die dieses Backend ausliefert. Alles läuft auf einem Server; Benutzer brauchen nur einen Browser und die Adresse dieses Servers.

## Anforderungen

| Komponente     | Anforderung                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Node.js        | 24.15 oder 26, wie im Feld `engines` von `package.json` angegeben                              |
| Datenbank      | MySQL/MariaDB oder PostgreSQL, vom Server aus erreichbar                                       |
| Datenbankkonto | Ein Benutzer, der Tabellen, Indizes und Fremdschlüssel in der Anwendungsdatenbank anlegen darf |
| Hostname       | Ein Name oder eine IP-Adresse, die Benutzer erreichen können                                   |
| Speicherplatz  | Das Paket selbst und die hochgeladenen Dateien unterhalb von `public/uploads`                  |

## HTTPS

Die Anwendung muss über HTTPS erreichbar sein: Das Cookie zur Sitzungserneuerung ist als `Secure` markiert, und ohne TLS verwirft der Browser es, sodass eine Sitzung nach 15 Minuten still endet, statt erneuert zu werden.

Das Backend selbst liefert reines HTTP und konfiguriert kein eigenes TLS. HTTPS kommt von dem, hinter dem das Backend sitzt: in der Entwicklung ist das der Vite-Dev-Server, der `https://localhost:5173` mit lokalen Zertifikaten ausliefert und `/api` und `/soundLib` an das Backend weiterleitet; im Betrieb ist es der Webserver der Hosting-Umgebung. In der Anwendung muss dafür nichts konfiguriert werden. `"trustProxy"` bleibt aus, solange der vorgelagerte Endpunkt den ursprünglichen Host und das Protokoll als Header weiterreicht und das Backend ihnen trauen soll; [Das Backend konfigurieren](configuration.md) dokumentiert den Schlüssel und [Sicherheitshinweise](security.md) erklärt das Cookie.

## Was das deployment package enthält

Das Paket wird im Repository mit `npm run package` gebaut. Es schreibt `dist-package/animada-score-book-<version>.tar.gz` und enthält:

| Pfad                                           | Zweck                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `dist/`                                        | Die gebaute Browser-Anwendung                                            |
| `server.js`                                    | Das Backend, mit allen Abhängigkeiten in eine Datei gebündelt            |
| `public/`                                      | Musikfonts, Klangsamples, Logos und hochgeladene Dateien                 |
| `build/seed.sql`                               | Anfängliche Ordner und Scores, in eine leere Datenbank importiert        |
| `migrations/`                                  | Das Schema und seine Migrationen                                         |
| `package.json`                                 | Ein Manifest mit einem einzigen `start`-Skript und keinen Abhängigkeiten |
| `backend-config.example.json`                  | Vorlage für die Konfigurationsdatei                                      |
| `docs/en/`, `docs/images/`                     | Das englische Handbuch mit den Screenshots, die es zeigt                 |
| `readme.md`, `release-notes.md`, `License.txt` | Produktübersicht, Versionshistorie und Lizenz                            |

Das Archiv enthält nie `backend-config.json`, `.env`-Dateien, `node_modules`, TypeScript-Quellen oder eine Lock-Datei.

Die Architecture Decision Records in `docs/adr/` und die Design Contracts in `docs/design/` bleiben im Repository. Sie beschreiben die Implementierung und nicht den Betrieb einer Installation, und das Kapitel [Architektur und Entscheidungen](../development/architecture.md) des Handbuchs verlinkt sie dort.

## Entpacken

```bash
tar -xzf animada-score-book-<version>.tar.gz
cd animada-score-book-<version>
```

Es gibt keinen Installationsschritt: `server.js` enthält das Backend zusammen mit `mysql2`, `pg`, `jsonwebtoken` und `mime-types`, und `dist/` enthält die gebaute Browser-Anwendung. Das Paket braucht Node.js und sonst nichts.

## Das Backend auf einem Server betreiben

Das Backend liefert die ganze Anwendung selbst aus: `dist/index.html`, die gebauten Assets, die API unter `/api`, die Klangbibliothek unter `/soundLib/` und die Dateien in `public/`. Daraus folgen zwei Konsequenzen, und beide sind zwingend, damit die Anwendung hochkommt:

1. **Das Arbeitsverzeichnis des Prozesses ist das Paketverzeichnis.** Jeder Pfad wird dagegen aufgelöst: `dist/`,
   `public/`, `migrations/`, `build/seed.sql` und `backend-config.json`. Starte den Prozess dort:

   ```bash
   cd /path/to/animada-score-book-<version>
   JWT_SECRET="<long random value>" node server.js
   ```

   Wenn das Hosting-Panel den Prozess von woanders startet, verwende `cd /path/to/animada-score-book-<version> && node server.js` als Startbefehl.

2. **Die Domain zeigt auf den Prozess, nicht auf einen Ordner.** Konfiguriere den Hostnamen als Reverse Proxy auf den
   Port aus `backend-config.json` (standardmäßig `3100`). Ein Document Root, der das Paketverzeichnis oder `dist/`
   statisch ausliefert, funktioniert nicht: Die Browser-Anwendung ruft `/api`, `/soundLib/` und `/public/uploads/` auf
   demselben Origin auf, und nur das Backend beantwortet sie.

**Binding und Frontend.** Die Beispiele binden an `0.0.0.0`, was auch der Standard ist, und die meisten Hoster brauchen genau das: Ihr Frontend terminiert TLS und leitet von einem anderen Host oder Container an die Anwendung weiter, ein Prozess, der auf `127.0.0.1` lauscht, verschwindet also aus der Domain, während alles andere richtig aussieht. Teste es, bevor du vom Standard abweichst: Stelle `host` auf `127.0.0.1`, starte neu, lade die Seite neu. Bleibt die Seite erreichbar, läuft der Forwarder auf demselben Host und die Loopback-Bindung hält den Port aus dem Netz; bricht sie, behalte `0.0.0.0`. Prüfe den Port auch einmal von außen, zum Beispiel mit `curl -I https://<host>:3100/`: Antwortet er, ist das Backend am Frontend vorbei erreichbar und gehört hinter eine Firewall. `"trustProxy"` bleibt `false`, solange das Frontend `X-Forwarded-For` nicht überschreibt, denn sonst kann jeder Client eine fremde Adresse behaupten und das Rate Limit der Anmeldung umgehen; [Das Backend konfigurieren](configuration.md) dokumentiert beide Schlüssel.

Das Paket hat keine `index.html` im Wurzelverzeichnis, und `dist/` ist kein Document Root; beides ist Absicht, weil das Backend die Oberfläche ausliefert. Prüfe ein neues Deployment mit `https://<host>/api?action=health`: Es antwortet mit `"status":"ok"` zusammen mit `"configLoaded":true`, `"database":"…"` und `"initialized":true`. Ein `404 Not found` für jede Adresse oder `"configLoaded":false` bedeutet, dass der Prozess in einem anderen Verzeichnis läuft; ein `Server Unreachable`-Dialog im Browser bedeutet, dass die Domain statisch statt über das Backend ausgeliefert wird. [Fehlerbehebung und bekannte Einschränkungen](../troubleshooting.md#die-seite-zeigt-not-found) führt das erste Symptom durch.

## Das Backend konfigurieren

Das Backend liest `backend-config.json` aus dem Verzeichnis, in dem es gestartet wird. Die Datei ist nicht optional: Sie enthält die Datenbankverbindung, und ohne brauchbaren Datenbankblock meldet der Browser nur, dass die Konfiguration fehlt. In einer Hosting-Umgebung werden Datenbankkonto und Zugangsdaten vom Hoster bereitgestellt, der von der Anwendung aus nicht erreichbar ist, diese Werte werden also immer von Hand eingetragen.

Lege die Datei aus der Vorlage an:

```bash
cp backend-config.example.json backend-config.json
```

Danach bearbeite mindestens den Datenbankblock. Eine minimale MySQL-Konfiguration sieht so aus:

```json
{
    "host": "0.0.0.0",
    "port": 3100,
    "database": {
        "engine": "mysql",
        "host": "127.0.0.1",
        "port": 3306,
        "database": "animada",
        "user": "animada",
        "password": "secret"
    }
}
```

Für PostgreSQL setze `"engine": "postgres"` und den passenden Port. Jeder Schlüssel und jede Umgebungsvariable, die ihn überschreibt, ist in [Das Backend konfigurieren](configuration.md) beschrieben.

Das Backend braucht außerdem die Umgebungsvariable `JWT_SECRET` und startet ohne sie nicht. Halte sie aus der Konfigurationsdatei heraus und stelle sie über den Dienstmanager bereit, zum Beispiel:

```bash
JWT_SECRET="<long random value>" node server.js
```

## Die Datenbank vorbereiten

Lege die Datenbank und einen Benutzer dafür vor dem ersten Start an. Das Backend legt das Schema in dieser Datenbank an, entweder wenn der Dialog im Browser es initialisiert oder, mit `"autoMigrate": true`, beim Start; die Datenbank selbst legt es nicht an. Das Konto braucht das Recht, Tabellen, Indizes und Fremdschlüssel in dieser Datenbank anzulegen.

MySQL oder MariaDB:

```sql
CREATE DATABASE animada CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'animada'@'localhost' IDENTIFIED BY 'secret';
GRANT ALL PRIVILEGES ON animada.* TO 'animada'@'localhost';
```

PostgreSQL:

```sql
CREATE DATABASE animada;
CREATE USER animada WITH PASSWORD 'secret';
GRANT ALL PRIVILEGES ON DATABASE animada TO animada;
```

## Der erste Start

```bash
JWT_SECRET="<long random value>" node server.js
```

Der Prozess verbindet sich mit der Datenbank und lauscht danach; `Backend connected: <engine> @ <host>:<port>/<database>` bestätigt die Verbindung. Mit `"autoMigrate": true` wendet der Start zusätzlich die Migrationen an und importiert `build/seed.sql` in eine leere Datenbank. Ein erfolgreicher Start protokolliert eine Zeile wie:

```
Backend server listening on http://127.0.0.1:3100 (bound to 0.0.0.0:3100)
```

Der erste Teil der Zeile ist die Adresse, die du auf dem Server selbst verwenden kannst; der zweite Teil ist das Interface, an das der Prozess gebunden ist.

## Der Installationsassistent

Öffne die Adresse in einem Browser. Solange die Datenbank keine Tabellen enthält, zeigt die Anwendung den Dialog `Backend Setup` mit Engine, Host, Port und Datenbankname aus der Konfiguration:

1. Prüfe die Werte und wähle `Initialize Database`. Das Backend wendet die Migrationen an, der Dialog meldet
   `Setting up database tables …` und dann `Database setup complete.`
2. Danach folgt der Dialog `Finish Installation`. Er fragt nach dem `Admin User` (`Username`, `Password`, `Confirm`,
   `Display Name`) und einer `Initial Group` (`Group Name`).

![Der Dialog Finish Installation](../../images/en/administration/first-run.png)

*`Finish Installation` legt den ersten Administrator und eine Gruppe in einem Schritt an; `Finish Installation` unten übermittelt beides.*

3. Anschließend erscheint der `Sign In`-Dialog. Melde dich mit dem gerade angelegten Administratorkonto an.

![Der Dialog Backend Setup mit Engine, Host, Port und Datenbank](../../images/en/administration/backend-setup.png)

*Der Dialog `Backend Setup` zeigt die konfigurierte Verbindung und bietet an, das Schema anzulegen. Die Datenbank selbst muss bereits existieren.*

`Reset Database` im selben Dialog löscht jede Tabelle und baut das Schema neu auf. Verwende es nur bei einer frischen Installation oder mit einem Backup zur Hand; siehe [Backup, Restore und Upgrades](backup-restore-upgrades.md).

Meldet der Dialog `Backend configuration is missing or invalid.`, konnte das Backend `backend-config.json` nicht lesen. Die Meldung nennt, was fehlt; korrigiere die Datei und starte den Prozess neu.

## Eine bestehende Installation aktualisieren

1. Stoppe das Backend.
2. Entpacke die neue Version in ein neues Verzeichnis.
3. Kopiere deine `backend-config.json` und das Verzeichnis `public/uploads` aus der alten Installation.
4. Starte das Backend mit `node server.js`. `"autoMigrate": true` wendet beim Start die ausstehenden Migrationen an;
   andernfalls fragt der Browser einmal, und `Initialize Database` wendet sie an.

Eine Migrationsdatei, die nach ihrem Lauf bearbeitet wurde, scheitert an der Prüfung der Checksumme und blockiert den Start; die Datenbank muss dann aus einem Backup neu aufgebaut werden. [Backup, Restore und Upgrades](backup-restore-upgrades.md) erklärt den Weg zurück.

## Verwandte Kapitel

- [Das Backend konfigurieren](configuration.md) dokumentiert jeden Konfigurationsschlüssel.
- [Sicherheitshinweise](security.md) erklärt Sitzungen, Cookies und Härtung.
- [Backup, Restore und Upgrades](backup-restore-upgrades.md) behandelt Backups und Migrationen.
