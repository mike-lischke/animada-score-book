# Die Score Library

Die Score Library ist der Drawer, der jeden Score enthält, den du erreichen kannst. Sie ordnet Scores in Ordnern, öffnet sie zum Abspielen und Bearbeiten, gibt Freigabelinks heraus und zeigt, wer einen Eintrag ändern darf.

## Die Bibliothek öffnen

Drücke die Schaltfläche `Score Library` im Header. Die Bibliothek öffnet sich über dem Score-Bereich, sodass der Score geladen bleibt, während du stöberst. Drücke `Escape` oder klicke außerhalb des Drawers, um ihn zu schließen.

Die Titelzeile des Drawers trägt die Schaltfläche `Add New Folder`, die einen Ordner auf der obersten Ebene anlegt.

![Score Library mit zwei geöffneten Ordnern und ihren Scores](../../images/en/library/library-tree.png)

*Der Drawer über dem Score: Ordner, ihre Scores und der Globus, der einen mit `World` geteilten Eintrag markiert.*

Auf einem Telefon nimmt der Drawer den größten Teil der Breite ein, und der Score bleibt dahinter abgedunkelt:

![Die Score Library auf einem Telefon](../../images/en/library/mobile-library.png)

*Die Bibliothek auf einem 390 Pixel breiten Bildschirm: die Titelzeile, die Ordner und die Zeilenmenüs bleiben erreichbar.*

## Ordner und Scores durchsuchen

Jede Zeile zeigt ein Symbol, den Namen des Eintrags, einen Berechtigungsindikator, wenn der Eintrag besonders ist, und eine Menüschaltfläche an ihrem rechten Ende:

- **Ordner** haben ein geschlossenes oder geöffnetes Ordnersymbol und enthalten weitere Ordner und Scores.
- **Scores** haben ein Musik-Symbol.
- Zeilen im Ladezustand zeigen einen Fortschrittsindikator, bis ihr Inhalt ankommt.

![Das Zeilenmenü eines Score](../../images/en/library/score-menu.png)

*Das Menü einer Score-Zeile: `Load Score`, `Copy Score URL`, `Remove Score` und `Group Access`.*

Doppelklicke einen Score oder wähle `Load Score` aus seinem Menü, um ihn zu öffnen. Der Drawer schließt sich, und der Score ersetzt den gerade geladenen.

## Ordner anlegen

- `Add New Folder` in der Titelzeile der Bibliothek legt einen Ordner auf der obersten Ebene an.
- `Add New Sub Folder` im Menü eines Ordners legt einen Ordner darin an.

Beide öffnen den Dialog `Add New Folder` mit einem einzigen Feld `Name`. Ein leerer Name wird ignoriert.

## Einen Score anlegen

`New Score` im Header öffnet den Dialog `New Song`:

| Feld             | Bedeutung                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| `Title`          | Der Name des Score; der Platzhalter ist `Untitled Arrangement`                                        |
| `Time Signature` | `4/4`, `6/8`, `5/4` oder `7/8`                                                                        |
| `Bars`           | Die Anzahl der bars, mit der der neue Score beginnt                                                   |
| `Tempo (BPM)`    | Das im Score gespeicherte Tempo                                                                       |
| `Instruments`    | Ein Eintrag pro Instrument; `Select All` und `Unselect All` helfen; mindestens eines ist erforderlich |

Der Dialog merkt sich Taktart, Tempo, Anzahl der bars und Instrumentauswahl pro Browser. `Create` startet den neuen Score im edit mode.

![Der Dialog New Song mit drei ausgewählten Instrumenten](../../images/en/library/new-score.png)

*`New Song` mit ausgewählten `Tamborim`, `Repinique` und `Caixa`; `Create` startet den Score, `Cancel` lässt den aktuellen unberührt.*

Ein neuer Score existiert zu diesem Zeitpunkt nur in deinem Browser. Das erste `Save Score` legt den Eintrag in der Bibliothek an, auf der obersten Ebene, und von da an wird der Score wie jeder andere vom Backend ausgeliefert.

`New Score` ist deaktiviert, solange der edit mode aktiv ist, denn das Verlassen des edit mode ist es, was den aktuellen Score speichert und entsperrt.

## Einen Score importieren

Das Menü eines Ordners öffnet `Import Score` mit einem einzigen Feld `Score URL`. Es akzeptiert einen BananaDrum-Freigabelink (`https://<host-name>/?t=...`) und ist aus der Zwischenablage vorbelegt, wenn diese eine URL enthält. Der Import legt einen neuen Score in diesem Ordner an, benannt nach dem Parameter `t` des Links, oder `Imported Score`, wenn der Parameter fehlt.

![Der Dialog Import Score](../../images/en/library/import-score.png)

*`Import Score` fragt nach einer URL; `OK` importiert sie in den Ordner, zu dem das Menü gehört.*

## Einen Score teilen

`Copy Score URL` im Menü eines Score kopiert einen Link der Form `https://<host>/?score=<id>` und bestätigt es mit `Score URL copied to clipboard.` Der Link öffnet den Score direkt; ob der Empfänger ihn öffnen kann, hängt von den unten beschriebenen Berechtigungen ab.

## Einträge umbenennen und entfernen

- `Rename Folder` öffnet einen Dialog mit dem aktuellen Namen als Startwert. Ein Score wird über seinen Titel umbenannt,
  während der edit mode aktiv ist.
- `Remove Folder` entfernt einen Ordner, aber nur solange er leer ist.
- `Remove Score` löscht einen Score.

Das Entfernen fragt mit dem Namen des Eintrags nach, mit den Schaltflächen `Delete` und `Cancel` und zwei Hinweisen: Die Aktion lässt sich nicht rückgängig machen, und du solltest den Inhalt exportieren, wenn du eine Kopie behalten willst. Exportiere den Score als PDF oder MP3, bevor du ihn entfernst, wenn du ihn wieder brauchen könntest.

## Berechtigungsindikatoren

Der Indikator neben einem Namen zeigt nur Ausnahmezustände:

| Indikator              | Bedeutung                                                     |
| ---------------------- | ------------------------------------------------------------- |
| `Read-only`-Markierung | Du darfst den Eintrag öffnen und abspielen, aber nicht ändern |
| Globus                 | Der Eintrag ist in der Gruppe `World` und damit öffentlich    |
| keiner                 | Du darfst den Eintrag schreiben, und er ist nicht öffentlich  |

Eigentümer und Administratoren erhalten einen Tooltip `Group Access` auf dem Indikator und können ihn anklicken, um den Berechtigungseditor zu öffnen. Der Indikator lässt sich mit der Einstellung `Show permission indicator` abschalten.

## Der Group Access-Editor

`Group Access` im Menü einer Zeile öffnet den Editor für diesen Eintrag:

- Der Kopf nennt den Eigentümer, oder `Inherited`, wenn der Eintrag seine Berechtigungen vom übergeordneten Ordner erbt.
- `Read` und `Write` listen die Gruppen, die diesen Zugriff haben; jeder Chip lässt sich wieder entfernen.
- `Groups` listet die übrigen Gruppen. Ziehe eine Gruppe auf `Read` oder `Write`, um Zugriff zu vergeben.
- `Write` schließt Lesezugriff immer ein, und der Editor hält die Gruppe `World` schreibgeschützt.
- `Reset Children`, verfügbar auf Ordnern, entfernt die ausdrücklichen Berechtigungen jedes Ordners und jedes Score unterhalb
  dieses Ordners, sodass alle wieder erben. Der Ordner selbst behält seine eigenen Berechtigungen.

![Der Group Access-Editor mit World in Read](../../images/en/library/group-access.png)

*`Read` enthält `World`, `Write` ist noch leer, und die übrigen Gruppen warten rechts darauf, hineingezogen zu werden.*

[Benutzer, Gruppen und Berechtigungen](../administration/users-groups-permissions.md) erklärt das zugrunde liegende Modell, die Gruppenpasswörter und die Gruppen `Admins` und `World`.

## Wer was darf

Das Backend entscheidet, nicht der Browser:

- **Lesezugriff** lässt dich einen Score öffnen, abspielen, drucken und exportieren, und er genügt, um ihn in diesem
  Browser zu bearbeiten.
- **Schreibzugriff** ist nötig, um einen Score zu speichern, Einträge zu entfernen und Ordner oder Importe innerhalb eines
  Ordners anzulegen.
- **Eigentum** ergänzt den Editor `Group Access`.
- **Administratoren** dürfen jeden Eintrag und jede Berechtigung verwalten und entfernen.
- **Anonyme Besucher** sehen jeden Eintrag der Gruppe `World` und sonst nichts.

Bearbeiten braucht keinen Schreibzugriff: Ohne angemeldetes Konto kannst du bei jedem Score, den du lesen kannst, den edit mode öffnen, und die Änderungen bleiben in diesem Browser. `Save Score` meldet dann `Sign in to save this score.` Ein angemeldetes Konto ohne Schreibzugriff wird abgewiesen, wenn es den edit mode betreten will, mit `You do not have permission to edit this score.`

## Score-Locks

Das Betreten des edit mode sperrt den Score im Backend, damit zwei Bearbeiter einander nicht stillschweigend überschreiben:

- Hält jemand anderes die Sperre, startet der edit mode nicht, und die Anwendung meldet `Score is being edited by <user> (since <date and time>)`.
- Sperren laufen nach 30 Minuten ab und werden freigegeben, wenn der Score gespeichert wird oder du den edit mode verlässt.
- Eine Sperre ist ein Entgegenkommen, keine Garantie: Das letzte Speichern gewinnt. Die [Sicherheitshinweise](../administration/security.md) führen dies und die übrigen Einschränkungen auf.

Wurde ein Score im Backend entfernt, während du ihn geöffnet hast, legt Speichern ihn als neuen Eintrag wieder an.

## Verwandte Kapitel

- [Deine erste Sitzung](../getting-started/first-steps.md) zeigt den ganzen Weg von der Anmeldung bis zum Speichern.
- [Benutzer, Gruppen und Berechtigungen](../administration/users-groups-permissions.md) erklärt Gruppen und Zugriffsregeln.
- [Einen Score lesen](presentation.md) behandelt die Ansichten, in denen die Bibliothek Scores öffnet.
