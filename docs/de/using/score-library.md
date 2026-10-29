# Die Score Library

Die Score Library ist der Drawer, der jede Partitur (englisch: score) enthält, die du erreichen kannst. Sie ordnet Partituren in Ordnern, öffnet sie zum Abspielen und Bearbeiten, gibt Freigabelinks heraus und zeigt, wer einen Eintrag ändern darf.

## Die Bibliothek öffnen

Klicke auf die Schaltfläche `Score Library` im Header. Die Bibliothek öffnet sich über dem Partiturbereich, sodass die Partitur geladen bleibt, während du stöberst. Drücke `Escape` oder klicke außerhalb des Drawers, um ihn zu schließen.

Die Titelzeile des Drawers trägt die Schaltfläche `Add New Folder`, die einen Ordner auf der obersten Ebene anlegt.

![Score Library mit zwei geöffneten Ordnern und ihren Partituren](../../images/en/library/library-tree.png)

*Der Drawer über der Partitur: Ordner, ihre Partituren und der Globus, der einen mit `World` geteilten Eintrag markiert.*

Auf einem Telefon nimmt der Drawer den größten Teil der Breite ein, und die Partitur bleibt dahinter abgedunkelt:

![Die Score Library auf einem Telefon](../../images/en/library/mobile-library.png)

*Die Bibliothek auf einem 390 Pixel breiten Bildschirm: die Titelzeile, die Ordner und die Zeilenmenüs bleiben erreichbar.*

## Ordner und Partituren durchsuchen

Jede Zeile zeigt ein Symbol, den Namen des Eintrags, einen Berechtigungsindikator, wenn der Eintrag besonders ist, und eine Menüschaltfläche an ihrem rechten Ende:

- **Ordner** haben ein geschlossenes oder geöffnetes Ordnersymbol und enthalten weitere Ordner und Partituren.
- **Partituren** haben ein Musik-Symbol.
- Zeilen im Ladezustand zeigen einen Fortschrittsindikator, bis ihr Inhalt ankommt.

![Das Zeilenmenü einer Partitur](../../images/en/library/score-menu.png)

*Das Menü einer Partiturzeile: `Load Score`, `Copy Score URL`, `Remove Score` und `Group Access`.*

Doppelklicke eine Partitur oder wähle `Load Score` aus ihrem Menü, um sie zu öffnen. Der Drawer schließt sich, und die Partitur ersetzt die gerade geladene.

## Ordner anlegen

- `Add New Folder` in der Titelzeile der Bibliothek legt einen Ordner auf der obersten Ebene an.
- `Add New Sub Folder` im Menü eines Ordners legt einen Ordner darin an.

Beide öffnen den Dialog `Add New Folder` mit einem einzigen Feld `Name`. Ein leerer Name wird ignoriert.

## Eine Partitur anlegen

`New Score` im Header öffnet den Dialog `New Song`:

| Feld             | Bedeutung                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| `Title`          | Der Name der Partitur; der Platzhalter ist `Untitled Arrangement`                                     |
| `Time Signature` | `4/4`, `6/8`, `5/4` oder `7/8`                                                                        |
| `Bars`           | Die Anzahl der Takte (englisch: bar), mit der die neue Partitur beginnt                               |
| `Tempo (BPM)`    | Das in der Partitur gespeicherte Tempo                                                                |
| `Instruments`    | Ein Eintrag pro Instrument; `Select All` und `Unselect All` helfen; mindestens eines ist erforderlich |

Der Dialog merkt sich Taktart, Tempo, Anzahl der Takte und Instrumentauswahl pro Browser. `Create` startet die neue Partitur im edit mode.

![Der Dialog New Song mit drei ausgewählten Instrumenten](../../images/en/library/new-score.png)

*`New Song` mit ausgewählten `Tamborim`, `Repinique` und `Caixa`; `Create` startet die Partitur, `Cancel` lässt die aktuelle unberührt.*

Eine neue Partitur existiert zu diesem Zeitpunkt nur in deinem Browser. Das erste `Save Score` legt den Eintrag in der Bibliothek an, auf der obersten Ebene, und von da an wird die Partitur wie jede andere vom Backend ausgeliefert.

`New Score` ist deaktiviert, solange der edit mode aktiv ist, denn das Verlassen des edit mode ist es, was die aktuelle Partitur speichert und entsperrt.

## Eine Partitur importieren

Das Menü eines Ordners öffnet `Import Score` mit einem einzigen Feld `Score URL`. Es akzeptiert einen BananaDrum-Freigabelink (`https://<host-name>/?t=...`) und ist aus der Zwischenablage vorbelegt, wenn diese eine URL enthält. Der Import legt eine neue Partitur in diesem Ordner an, benannt nach dem Parameter `t` des Links, oder `Imported Score`, wenn der Parameter fehlt.

![Der Dialog Import Score](../../images/en/library/import-score.png)

*`Import Score` fragt nach einer URL; `OK` importiert sie in den Ordner, zu dem das Menü gehört.*

## Eine Partitur teilen

`Copy Score URL` im Menü einer Partitur kopiert einen Link der Form `https://<host>/?score=<id>` und bestätigt es mit `Score URL copied to clipboard.` Der Link öffnet die Partitur direkt; ob der Empfänger sie öffnen kann, hängt von den unten beschriebenen Berechtigungen ab.

## Einträge umbenennen und entfernen

- `Rename Folder` öffnet einen Dialog mit dem aktuellen Namen als Startwert. Eine Partitur wird über ihren Titel umbenannt,
  während der edit mode aktiv ist.
- `Remove Folder` entfernt einen Ordner, aber nur solange er leer ist.
- `Remove Score` löscht eine Partitur.

Das Entfernen fragt mit dem Namen des Eintrags nach, mit den Schaltflächen `Delete` und `Cancel` und zwei Hinweisen: Die Aktion lässt sich nicht rückgängig machen, und du solltest den Inhalt exportieren, wenn du eine Kopie behalten willst. Exportiere die Partitur als PDF oder MP3, bevor du sie entfernst, wenn du sie wieder brauchen könntest.

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
- `Reset Children`, verfügbar auf Ordnern, entfernt die ausdrücklichen Berechtigungen jedes Ordners und jeder Partitur unterhalb
  dieses Ordners, sodass alle wieder erben. Der Ordner selbst behält seine eigenen Berechtigungen.

![Der Group Access-Editor mit World in Read](../../images/en/library/group-access.png)

*`Read` enthält `World`, `Write` ist noch leer, und die übrigen Gruppen warten rechts darauf, hineingezogen zu werden.*

[Benutzer, Gruppen und Berechtigungen](../administration/users-groups-permissions.md) erklärt das zugrunde liegende Modell, die Gruppenpasswörter und die Gruppen `Admins` und `World`.

## Wer was darf

Das Backend entscheidet, nicht der Browser:

- **Lesezugriff** lässt dich eine Partitur öffnen, abspielen, drucken und exportieren, und er genügt, um ihn in diesem
  Browser zu bearbeiten.
- **Schreibzugriff** ist nötig, um eine Partitur zu speichern, Einträge zu entfernen und Ordner oder Importe innerhalb eines
  Ordners anzulegen.
- **Eigentum** ergänzt den Editor `Group Access`.
- **Administratoren** dürfen jeden Eintrag und jede Berechtigung verwalten und entfernen.
- **Anonyme Besucher** sehen jeden Eintrag der Gruppe `World` und sonst nichts.

Bearbeiten braucht keinen Schreibzugriff: Ohne angemeldetes Konto kannst du bei jeder Partitur, die du lesen kannst, den edit mode öffnen, und die Änderungen bleiben in diesem Browser. `Save Score` meldet dann `Sign in to save this score.` Ein angemeldetes Konto ohne Schreibzugriff wird abgewiesen, wenn es den edit mode betreten will, mit `You do not have permission to edit this score.`

## Partitursperren

Das Betreten des edit mode sperrt die Partitur im Backend, damit zwei Bearbeiter einander nicht stillschweigend überschreiben:

- Hält jemand anderes die Sperre, startet der edit mode nicht, und die Anwendung meldet `Score is being edited by <user> (since <date and time>)`.
- Sperren laufen nach 30 Minuten ab und werden freigegeben, wenn die Partitur gespeichert wird oder du den edit mode verlässt.
- Eine Sperre ist ein Entgegenkommen, keine Garantie: Das letzte Speichern gewinnt. Die [Sicherheitshinweise](../administration/security.md) führen dies und die übrigen Einschränkungen auf.

Wurde eine Partitur im Backend entfernt, während du sie geöffnet hast, legt Speichern sie als neuen Eintrag wieder an.

## Verwandte Kapitel

- [Deine erste Sitzung](../getting-started/first-steps.md) zeigt den ganzen Weg von der Anmeldung bis zum Speichern.
- [Benutzer, Gruppen und Berechtigungen](../administration/users-groups-permissions.md) erklärt Gruppen und Zugriffsregeln.
- [Eine Partitur lesen](presentation.md) behandelt die Ansichten, in denen die Bibliothek Partituren öffnet.
