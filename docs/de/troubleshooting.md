# Fehlerbehebung und bekannte Einschränkungen

Dieses Kapitel listet die Probleme, die in der Praxis auftreten, mit Ursache und Abhilfe, und sammelt das, was die Version 2.0.1 dokumentiert, statt es zu beheben.

## Das Backend ist nicht erreichbar

Kann der Browser das Backend beim Start nicht erreichen, zeigt er `Server Unreachable` mit `The Animada Score Book server could not be reached. Make sure the backend is running and try again.` und einer Schaltfläche `Retry`. Ein Fehler beim Laden der Konfiguration erscheint als `Connection Error` mit der Meldung des Backends. Prüfe in dieser Reihenfolge:

1. Läuft der Prozess? Das Startprotokoll endet mit `Backend server listening on http://…`.
2. Stimmt die Adresse im Browser mit `host` und `port` aus `backend-config.json` überein?
3. Ist die Datenbank erreichbar? Ohne sie läuft der Prozess weiter, kann aber nicht antworten.
4. Blockiert eine Firewall oder die Hosting-Umgebung den Port?

Der Prozess beendet sich sofort, wenn der Port belegt ist: `Port <port> is already in use.`

## Die Seite zeigt `Not found`

Ein Deployment, das jede Adresse mit dem reinen Text `Not found` beantwortet, erreicht das Backend, aber der Prozess wurde im falschen Verzeichnis gestartet. Jeder Pfad, den das Backend ausliefert, ist relativ zu seinem Arbeitsverzeichnis: `dist/index.html`, `public/`, `migrations/`, `build/seed.sql` und `backend-config.json`. Im Unterverzeichnis `dist` gestartet, sucht es `dist/dist/index.html` und `dist/backend-config.json`, findet beides nicht und antwortet mit diesem Text und `404`.

Der Health-Endpunkt nennt die Ursache, statt sie zu verbergen:

```json
{"configLoaded":false,"configError":"No backend-config.json found. Missing database settings: database.host, database.port, database.database, database.user.","engine":"mysql","host":"","port":0,"database":"","status":"error","dbStatus":"db_unreachable","initialized":false,"hasData":false,"hasUsers":false}
```

`configLoaded: false` zusammen mit dieser `configError` bedeutet, dass der Prozess `backend-config.json` nicht aus seinem Arbeitsverzeichnis lesen konnte. Die Datenbank ist nicht das Problem; die Zeile `Database unreachable` ist nur eine Folge der leeren Verbindungseinstellungen.

Zur Behebung:

1. Starte den Prozess im Paketverzeichnis, wo `server.js`, `dist/`, `public/`, `migrations/`, `build/` und `backend-config.json` liegen — nicht in `dist`. [Animada Score Book installieren](administration/installation.md#das-backend-auf-einem-server-betreiben) nennt beide Anforderungen eines Deployments.
2. Leite die Domain auf diesen Prozess, zum Beispiel über einen Reverse Proxy auf seinen Port. `/api`, `/soundLib/` und `/public/uploads/` beantwortet nur das Backend, ein Document Root auf `dist` kann die Anwendung also nicht ausliefern.
3. `https://<host>/api?action=health` sollte dann `"status":"ok"` mit `"configLoaded":true` und `"initialized":true` melden.

Die umgekehrte Fehlkonfiguration hat das umgekehrte Symptom: Ein statisch ausgeliefertes `dist` lädt die Oberfläche, die dann `Server Unreachable` meldet, weil sie `/api` nicht erreicht.

## Die Verbindung geht während einer Sitzung verloren

Eine unterbrochene Verbindung während der Arbeit öffnet einen Dialog mit `Reconnecting… (attempt <n>)`. Die Anwendung versucht es alle drei Sekunden erneut und schließt den Dialog kurz, nachdem das Backend wieder antwortet. Ungespeicherte Änderungen bleiben im Browser und gehen nicht verloren; speichere, sobald die Verbindung wieder steht.

![Der Dialog zum Wiederverbinden mit dem Datenbankfehler](../images/en/troubleshooting/connection-lost.png)

*`Backend Connection Lost` mit dem zugrunde liegenden Fehler darunter; der Spinner ist der Wiederverbindungsversuch, der alle drei Sekunden läuft.*

## Ein unerwarteter Fehler

Scheitert eine Ansicht beim Rendern, ersetzt die Anwendung die ganze Oberfläche durch eine Fehlerseite, statt ein leeres Fenster zu hinterlassen:

![Die Fehlerseite mit ihren Aktionen und den eingeklappten technischen Details](../images/en/troubleshooting/error-page.png)

*Ein unerwarteter Fehler ersetzt die Anwendung durch diese Seite: `Retry` rendert die Ansicht erneut, `Reload app` startet die Anwendung neu, und `Technical details` enthält Meldung und Stacktrace für eine Meldung.*

- `Retry` rendert die Ansicht erneut, was nach einem vorübergehenden Problem oft genügt. `Reload app` startet die Anwendung neu; ungespeicherte Änderungen können verloren gehen.
- `Still not working?` verlinkt auf den GitHub-Issue-Tracker. Nenne, was du gerade getan hast und welcher Score geöffnet war.
- `Technical details` enthält die Version der Anwendung, die Fehlermeldung und den Stacktrace, mit `Copy details`, um sie in die Zwischenablage zu legen. Bearer-Tokens, Passwörter und Tokens in URLs werden maskiert, bevor sie angezeigt werden.

## Die Installation lässt sich nicht abschließen

| Meldung                                                                    | Ursache und Abhilfe                                                                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Backend configuration is missing or invalid.`                             | `backend-config.json` fehlt, ist unlesbar oder enthält keine Datenbankeinstellungen. Korrigiere sie und starte den Prozess neu. |
| `Could not auto-connect: …` gefolgt von `Waiting for setup from frontend…` | Die Datenbankverbindung ist gescheitert. Korrigiere den Datenbankblock in `backend-config.json` und starte den Prozess neu.     |
| `backend-config.json is not valid JSON`                                    | Der Dialog zeigt den Parse-Fehler. Repariere das JSON in der Datei und starte den Prozess neu.                                  |
| `The database schema is incomplete.`                                       | Tabellen eines älteren Schemas oder eine halb migrierte Datenbank. Wähle `Reset Database` im selben Dialog.                     |
| `Port <port> is already in use.`                                           | Ein anderer Prozess hält den Port. Beende ihn oder ändere `port`.                                                               |

## Fehlgeschlagene Anmeldungen und Sperren

- `Invalid group name or password` wird sowohl für eine unbekannte Gruppe als auch für ein falsches Passwort zurückgegeben. Prüfe zuerst den Gruppennamen, dann das geteilte Passwort.
- Nach sieben Fehlversuchen für dieselbe Client-Adresse und dasselbe Konto antwortet das Backend 15 Minuten lang mit `Too many attempts. Try again later.` Ein Neustart löscht die Zähler; eine erfolgreiche Anmeldung löscht sie ebenfalls.
- Hinter einem Proxy, der nicht mit `trustProxy` konfiguriert ist, teilen sich alle Benutzer die Adresse des Proxys, eine Sperre trifft also alle. Siehe [Das Backend konfigurieren](administration/configuration.md).
- Über reines HTTP verwirft der Browser das `Secure`-Cookie zur Sitzungserneuerung, die Sitzung endet also nach 15 Minuten, obwohl sie vorher funktioniert hat. Verwende HTTPS.
- Ist die Sitzung beendet, meldet die Anwendung `Your session has ended — log in again to save this score.` oder `Your session has ended. Log in again to edit.`

## Berechtigungsfehler

- `You do not have permission to edit this score.` und `You do not have permission to save this score.` bedeuten, dass dem Konto der Schreibzugriff fehlt. Nötig ist der Eigentümer, eine Gruppenfreigabe oder ein Administrator; [Benutzer, Gruppen und Berechtigungen](administration/users-groups-permissions.md) erklärt, wie Zugriff aufgelöst wird.
- `You do not have permission to save this score.` erscheint auch, wenn ein Score über einen Link geöffnet wurde und das Konto ihn nur lesen darf.
- Ohne angemeldetes Konto funktioniert das Bearbeiten selbst: Die Änderungen bleiben im Browser, und `Save Score` meldet `Sign in to save this score.`

## Ein Score ist gesperrt

`Score is being edited by <user> (since <date and time>)` bedeutet, dass jemand anderes bei diesem Score im edit mode ist:

- Die Sperre dauert 30 Minuten und wird freigegeben, wenn der andere Bearbeiter speichert oder den edit mode verlässt.
- Warten ist heute die einzige Option; es gibt keine Möglichkeit, eine Sperre über die Oberfläche zu brechen.
- Die Sperre ist ein Entgegenkommen. Speichern ist last-write-wins, koordiniert euch also außerhalb der Anwendung, wenn beide Bearbeiter weiterarbeiten müssen.

## Fehlende Klänge oder Musikfonts

- Spielen Noten stumm oder hat ein einzelnes Instrument keinen Klang, ist die Klangbibliothek unvollständig oder `soundLibPath` zeigt auf das falsche Verzeichnis. Die Samples liegen in `public/sounds`; ein geänderter Pfad erfordert einen Neustart.
- `The selected music font could not be loaded.` bedeutet, dass die Fontdateien fehlen oder beschädigt sind. Wähle in den `Settings` einen anderen Font; das Paket liefert alle angebotenen Fonts mit.

## Probleme beim Export

- `The MP3 could not be exported. Please try again.` erscheint, wenn der Browser kein MP3 kodieren kann oder das Rendern scheitert. Getestet ist der Export mit Chromium-basierten Browsern.
- Ein MP3 enthält den ganzen Score: Looping wird ignoriert, und ein Play Focus-Bereich wird nicht exportiert.
- PDF-Ausgabe kommt aus dem Druckdialog des Browsers; die Anwendung erzeugt selbst keine PDF-Dateien.

## Die Druckausgabe weicht von der Vorschau ab

Vergleiche diese Einstellungen:

1. Papierformat A4 und die in der Vorschau gewählte Ausrichtung.
2. Skalierung des Browsers auf 100 %; die Druckskalierung in der Vorschau dimensioniert die Notation.
3. Kopf- und Fußzeilen des Browsers ausgeschaltet; das Dokument bringt eigenen Titel, Ränder und Seitenzahlen mit.
4. Keine zusätzlichen Ränder des Browsers.

## Bekannte Einschränkungen

| Bereich           | Einschränkung                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Zoom              | Nur manuell, 50 % bis 150 %; kein Pinch- oder Radzoom. `Fit width` und `Fit page` gibt es nur in der print preview               |
| Dynamics          | Nur in der staff view im edit mode setzbar                                                                                       |
| Instrumente       | Im Code definiert; es gibt keine Instrumentenverwaltung und keine Oberfläche für eine Klangbibliothek pro Installation           |
| Auditierung       | `login_audit` wird geschrieben, aber von keiner Ansicht gelesen                                                                  |
| Konten            | Kein Self-Service-Passwortwechsel und keine Verwaltung von Sitzungen oder Geräten                                                |
| Backups           | Keine Backup- oder Restore-Werkzeuge in der Anwendung; `build/dump-seed.ts` deckt nur Ordner und Scores ab                       |
| Datenbank-Engines | Kein Migrationspfad von MySQL nach PostgreSQL oder zurück                                                                        |
| Score-Historie    | Scores werden pro Speichern als ein Block abgelegt; keine Versionshistorie, und gleichzeitige Speicherungen sind last-write-wins |
| Sitzungen         | Undo-Historie und Wiedergabeposition gelten nur für die Sitzung                                                                  |
| PDF               | Keine PDF-Erzeugung in der Anwendung                                                                                             |
| MP3               | Braucht die MP3-Kodierung des Browsers; kein Loop- und kein Bereichsexport                                                       |
| Gruppen-Login     | Gruppen-Logins teilen das Konto `anonymous`, und ein neuer Gruppen-Login beendet die vorherige Gruppensitzung                    |
| Score-Locks       | 30 Minuten, kein Heartbeat, nur beim Speichern oder Verlassen des edit mode freigegeben                                          |
| Anonymer Zugriff  | Anonyme Besucher sehen jeden Score, der mit `World` geteilt ist                                                                  |
| Listen            | Benutzer- und Gruppenlisten sind nicht seitenweise aufgeteilt                                                                    |
| HTTPS             | Das Backend selbst liefert HTTP; das Cookie zur Sitzungserneuerung braucht TLS davor                                             |
| Migrationsdateien | Eine nach ihrem Lauf geänderte Migrationsdatei blockiert den Start; es gibt keine Down-Migrationen                               |

## Verwandte Kapitel

- [Sicherheitshinweise](administration/security.md) erklärt Sitzungen, Cookies und Rate Limiting.
- [Animada Score Book installieren](administration/installation.md) behandelt Konfigurationsfehler und den Setup-Dialog.
- [Drucken, PDF und MP3-Export](using/printing-and-export.md) beschreibt die Ausgabe selbst.
