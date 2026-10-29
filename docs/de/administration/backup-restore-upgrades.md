# Backup, Restore und Upgrades

Alles, was sich nicht neu erzeugen lässt, liegt in der Datenbank oder in den Dateien unterhalb von `public/uploads`. Dieses Kapitel zeigt, was zu schützen ist, wie man es sichert und was das Backend beim nächsten Start nach einem Upgrade tut.

## Was wo liegt

| Ort                | Inhalt                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datenbank          | Ordner, Partituren (englisch: score) und ihr Inhalt, Benutzer, Gruppen, Gruppenmitgliedschaften, Berechtigungsfreigaben, die Migrationshistorie und das Login-Audit |
| `public/uploads`   | Dateien, die über den Endpunkt für Instrumentenbilder hochgeladen wurden                                                                                            |
| Browser            | Oberflächeneinstellungen, die aktuelle Partitur als lokale Kopie und die Auswahl                                                                                    |
| deployment package | Anwendung, Musikfonts, Klangsamples und Migrationen — jederzeit ersetzbar                                                                                           |

Die Browser-Kopie ist eine Bequemlichkeit, kein Backup: Sie gehört zu einem Browserprofil und einem Gerät, und das Löschen der Websitedaten entfernt sie.

## Die Datenbank sichern

Verwende den effektiven Datenbanknamen, den das Backend beim Start als `Backend initialised: <engine> @ <host>:<port>/<database>` ausgibt. In der Entwicklung kann das eine Branch-Datenbank sein, nicht der konfigurierte Name.

MySQL oder MariaDB:

```bash
mysqldump --single-transaction --routines --triggers -u animada -p animada > animada-$(date +%F).sql
```

PostgreSQL:

```bash
pg_dump -U animada -Fc animada > animada-$(date +%F).dump
```

Beide Befehle enthalten das Schema, die Daten und die Tabelle `migration_history`, auf die sich der nächste Start verlässt. `--single-transaction` hält einen MySQL-Dump konsistent, ohne die Tabellen zu sperren, solange sie InnoDB nutzen.

Kopiere auch das Upload-Verzeichnis, wenn je Dateien hochgeladen wurden:

```bash
tar -czf animada-uploads-$(date +%F).tar.gz public/uploads
```

## Wiederherstellen

1. Stoppe das Backend.
2. Lege eine leere Datenbank neu an und stelle dorthin wieder her.

   ```bash
   mysql -u animada -p animada < animada-2026-10-27.sql
   pg_restore -U animada -d animada animada-2026-10-27.dump
   ```

3. Stelle `public/uploads` neben der Anwendung wieder her.
4. Starte das Backend und prüfe das Protokoll: `All migrations already applied.` bedeutet, dass der Dump zur Version des
   Codes passt.
5. Prüfe das Ergebnis: Melde dich an, öffne eine Partitur, prüfe eine Gruppenfreigabe im Berechtigungseditor und spiele einen
   Takt (englisch: bar).

Eine Wiederherstellung in eine Datenbank, die bereits Tabellen enthält, scheitert an der ersten doppelten Tabelle. Lösche die Datenbank vorher und lege sie neu an, oder stelle in einen neuen Namen wieder her und lasse `backend-config.json` darauf zeigen.

## Migrationen beim Start

Das Backend wendet das Schema selbst an:

- Beim Start legt es `migration_history` an oder liest sie und wendet jede Datei aus `migrations/` an, die es noch nicht
  aufgezeichnet hat, in der Reihenfolge der Dateinamen.
- Jede angewendete Datei wird mit ihrer SHA-256-Checksumme gespeichert.
- Eine Migrationsdatei kann Abschnitte mit `-- @mysql` und `-- @postgres` tragen; der Runner führt nur die Abschnitte für
  die konfigurierte Engine aus, plus alles außerhalb solcher Markierungen.
- Ausstehende Migrationen laufen direkt nach dem Start des Prozesses, wenn `"autoMigrate": true` gesetzt ist; andernfalls
  warten sie auf `Initialize Database` im Browser. Das Protokoll listet sie, und `Backend initialised: …` erscheint,
  sobald das Schema bereit ist.

## Eine geänderte Migrationsdatei

Ändert sich eine Migrationsdatei, nachdem sie angewendet wurde — etwa bei einem Rebase —, scheitert der Start mit:

```
Migration "<file>" was modified after it was applied.
Drop the branch database and restart the server to re-apply all migrations.
```

Es gibt keine Down-Migrationen und keinen Reparaturschritt. Die einzigen Wege vorwärts sind das Wiederherstellen eines Backups, das zum Code passt, oder ein Neuaufbau der Datenbank, der jeden Benutzer und jede Partitur verliert. Deshalb wird `migrations/` als append-only behandelt.

## Zwischen Releases aktualisieren

1. Stoppe das Backend.
2. Entpacke das neue Paket in ein neues Verzeichnis.
3. Kopiere `backend-config.json` und `public/uploads` aus der alten Installation.
4. Starte das Backend mit `node server.js`. Mit `"autoMigrate": true` laufen die ausstehenden Migrationen sofort;
   andernfalls bietet der Browser einmal `Initialize Database` an und wendet sie an.

Nach dem Upgrade:

- Der Browser hält möglicherweise noch die vorherige Version der Anwendung; ein Neuladen holt die neue.
- Sitzungen überleben, solange `JWT_SECRET` gleich bleibt.
- Der Footer zeigt die Version der Anwendung, die der Browser geladen hat, ein Neuladen nach dem Upgrade bestätigt also
  die neue Version.

## Branch-Datenbanken in der Entwicklung

In einem Checkout hängt das Backend den aktuellen Branch an den Datenbanknamen an, wie in [Das Backend konfigurieren](configuration.md) beschrieben. Zwei Werkzeuge helfen dort:

- `npm run db:cleanup` listet Datenbanken, deren Branch nicht mehr existiert, und gibt die `DROP DATABASE`-Befehle zum
  manuellen Ausführen aus.
- `npm run db:migrate` wendet Migrationen an, ohne den Server zu starten.

Eine Abweichung der Checksumme in der Entwicklung bedeutet meist, dass der Branch rebased wurde; das Löschen der Branch-Datenbank ist die vorgesehene Abhilfe.

## Die Datenbank als letztes Mittel zurücksetzen

`Reset Database` im Dialog `Backend Setup` löscht jede Tabelle und baut das Schema neu auf. Danach existieren die Seed-Daten und das geteilte Konto `anonymous` wieder, und `Finish Installation` fragt nach dem ersten Administrator.

Alles andere ist weg: Partituren, Benutzer, Gruppen, Freigaben und das Login-Audit. Exportiere, was du brauchst, und lege ein Backup an, bevor du es nutzt.

## Verwandte Kapitel

- [Animada Score Book installieren](installation.md) behandelt den ersten Start und den Assistenten.
- [Das Backend konfigurieren](configuration.md) erklärt die Datenbankeinstellungen und die Branch-Datenbanken.
- [Fehlerbehebung und bekannte Einschränkungen](../troubleshooting.md) listet die Einschränkungen rund um Migrationen
  und Backups.
