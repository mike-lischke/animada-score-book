# Benutzer, Gruppen und Berechtigungen

Konten entscheiden, wer einen Score lesen und ändern darf. Der Verwaltungsbereich dafür ist der Dialog `Users & Groups`, erreichbar über das Überlaufmenü im Header. Ein Benutzer, der kein Administrator ist, sieht denselben Dialog mit dem Titel `My Groups`, ohne den Tab `Users`, und kann nur die Gruppen ändern, die er administriert.

## Der erste Administrator

Der erste Administrator wird direkt nach der Initialisierung der Datenbank im Dialog `Finish Installation` angelegt:

- `Admin User`: `Username`, `Password`, `Confirm` und `Display Name`.
- `Initial Group`: ein `Group Name` für die Gruppe, der neue Benutzer zugeordnet werden können.

Das Konto wird Mitglied der Gruppe `Admins`, was die Verwaltungsrechte verleiht. [Animada Score Book installieren](installation.md) beschreibt den Dialog in seinem Zusammenhang.

## Benutzer

Der Tab `Users` listet jedes Konto mit Benutzername, Anzeigename und einem `admin`-Badge für Mitglieder der Gruppe `Admins`. `+` legt ein Konto an; jede Zeile bietet `Edit`, `Reset Password` und `Delete`.

Der Dialog `Edit` enthält:

| Feld               | Regeln                                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| `Username`         | Mindestens 3 Zeichen, eindeutig; nach dem Anlegen nicht änderbar       |
| `Display Name`     | Wird in der Oberfläche gezeigt; standardmäßig der Benutzername         |
| `Password`         | Mindestens 6 Zeichen; leer bedeutet „das aktuelle behalten“            |
| `Group Membership` | Beliebig viele Gruppen, als Chips mit Autovervollständigung eingegeben |

`Reset Password` fragt nach einem `New Password` mit derselben Mindestlänge. Das Löschen eines Kontos entfernt es und seine Gruppenmitgliedschaften; das letzte Mitglied von `Admins` lässt sich nicht löschen.

![Die Benutzerliste des Dialogs Users and Groups](../../images/en/administration/users.png)

*Die Benutzerliste: Anzeigename, `@user`-Handle, das `admin`-Badge, wo es zutrifft, und `Edit`, `Reset Password` und `Delete` pro Zeile.*

## Gruppen

Der Tab `Groups` listet die Gruppen mit ihren Mitgliederzahlen. `+` legt eine an; jede Zeile bietet `Edit Group` und `Delete Group`. Der Dialog enthält:

| Feld       | Bedeutung                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------- |
| `Name`     | Der Gruppenname, beim Anlegen gesetzt und eindeutig                                         |
| `Admin`    | Der Administrator der Gruppe, aus den Benutzern gewählt; `None` lässt die Gruppe ohne       |
| `Password` | Ein optionales geteiltes Passwort, das den Gruppen-Login ermöglicht                         |
| `Members`  | Die Benutzer der Gruppe, mit einem Filter zum Finden und einer Entfernen-Aktion pro Eintrag |

Ein Gruppenadministrator darf diese Gruppe verwalten, ohne Administrator der Installation zu sein.

![Die Gruppenliste des Dialogs Users and Groups](../../images/en/administration/groups.png)

*Die Gruppenliste mit dem Administrator-Chip pro Gruppe: `Bateria Central` und `Bloco da Praia` haben einen, `Admins` und `World` können keinen bekommen.*

## Gruppen-Login

Hat eine Gruppe ein geteiltes Passwort, akzeptiert der Tab `Group` des Dialogs `Sign In` den Gruppennamen und dieses Passwort. Das ist für ein geteiltes Gerät oder einen Proberaum gedacht, in dem niemand ein persönliches Passwort tippen will.

Im Hintergrund zählen drei Regeln:

- Ein Gruppen-Login nutzt das geteilte Konto `anonymous`, alle Gruppen-Logins erscheinen dem Backend also als derselbe
  Benutzer.
- Die Sitzung trägt nur diese Gruppe plus `World`; andere Gruppenmitgliedschaften des Kontos gelten nicht.
- Jede Kontozeile hält ein Refresh-Token, ein neuer Gruppen-Login auf demselben Server beendet also die vorherige
  Gruppensitzung.

![Der Dialog Sign In im Tab Group](../../images/en/administration/group-login.png)

*Der Tab `Group` fragt nach einer Gruppe und ihrem geteilten Passwort. Die Auswahlliste liest `No groups available`, solange keine Gruppe ein Passwort hat.*

## Die Gruppen `Admins` und `World`

Beide Gruppen existieren immer und verhalten sich anders als gewöhnliche Gruppen:

- Mitglieder von `Admins` umgehen jede Berechtigungsprüfung. Die Mitglieder der Gruppe lassen sich bearbeiten, aber die
  Gruppe lässt sich nicht löschen, kann kein Passwort bekommen, und der letzte verbleibende Administrator lässt sich
  nicht entfernen.
- `World` ist die öffentliche Gruppe. Jeder Benutzer und jeder anonyme Besucher ist automatisch Mitglied, ein mit `World`
  geteilter Score ist also öffentlich lesbar. Die Gruppe selbst lässt sich weder bearbeiten noch löschen.

## Eigentum und geerbter Zugriff

Jeder Ordner und jeder Score hat einen Eigentümer — das Konto, das ihn angelegt hat — und eine Reihe von Gruppenfreigaben. Der Zugriff wird in dieser Reihenfolge aufgelöst:

1. Administratoren haben vollen Zugriff auf alles.
2. Der Eigentümer eines Eintrags hat Lese- und Schreibzugriff darauf.
3. Gruppenfreigaben werden für den Eintrag und dann für jeden Ordner darüber gesammelt, bis zur obersten Ebene. Eine
   Freigabe auf einem übergeordneten Ordner gilt also für alles darin.
4. Entlang dieser Kette kann ein Kind `read` zu `write` aufwerten, aber eine `write`-Freigabe von oben wird weiter unten
   nie zu `read` herabgestuft.

`Write` schließt `read` immer ein. Anonyme Besucher halten nur, was `World` ihnen gewährt.

## Der Group Access-Editor

`Group Access` im Menü einer Zeile der Score Library öffnet den Editor für diesen Eintrag. Er zeigt den Eigentümer, die Gruppen mit `Read` und `Write` und die übrigen Gruppen zum Hineinziehen. [Die Score Library](../using/score-library.md) beschreibt die Bedienung; dieses Kapitel beschreibt die Regeln dahinter.

## Geerbten Zugriff zurücksetzen

`Reset Children`, verfügbar auf Ordnern im Berechtigungseditor, entfernt die ausdrücklichen Freigaben jedes Ordners und jedes Score unterhalb dieses Ordners. Alle erben wieder von ihren übergeordneten Ordnern, während der Ordner selbst seine Freigaben behält. Verwende es nach dem Umsortieren eines Ordnerbaums, wenn verschobene Einträge sonst veraltete Freigaben mit sich tragen würden.

## Die Datenbank zurücksetzen

Die Aktion `Reset Database` im Dialog `Backend Setup` löscht jede Tabelle und baut das Schema über die Migrationen neu auf. Danach werden die Seed-Daten und das geteilte Konto `anonymous` erneut angelegt, und der Dialog `Finish Installation` erscheint, wie bei einer frischen Installation.

Das löscht jeden Benutzer, jede Gruppe, jede Freigabe und jeden Score. Exportiere die Scores, die du brauchst, und lege zuerst ein Datenbank-Backup an; [Backup, Restore und Upgrades](backup-restore-upgrades.md) erklärt wie.

## Bekannte Grenzen

- Keine der Listen ist seitenweise aufgeteilt; große Installationen brauchen eine Datenbankabfrage für einen Überblick.
- Es gibt keinen Self-Service-Passwortwechsel und keine Verwaltung von Sitzungen oder Geräten, ein vergessenes Passwort
  führt also immer über `Reset Password` durch einen Administrator.
- Die Tabelle `login_audit` zeichnet Anmeldungen und Gruppen-Logins auf, aber keine Ansicht in der Anwendung liest sie.
- Der Berechtigungseditor vergibt `World` nie Schreibzugriff; das Backend erzwingt diese Regel selbst nicht.

## Verwandte Kapitel

- [Die Score Library](../using/score-library.md) erklärt, wo der Berechtigungseditor und die Indikatoren erscheinen.
- [Sicherheitshinweise](security.md) behandelt Passwörter, Token und Brute-Force-Begrenzung.
- [Backup, Restore und Upgrades](backup-restore-upgrades.md) behandelt Backups vor einem Reset.
