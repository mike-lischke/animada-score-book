# Sicherheitshinweise

Das Backend entscheidet, wer was lesen und ändern darf. Dieses Kapitel beschreibt, wie es Konten und Sitzungen schützt und welche Teile eines sicheren Deployments Aufgabe des Betreibers bleiben.

## Passwortspeicherung

Passwörter werden mit scrypt gehasht: ein zufälliges Salt pro Passwort, `N = 16384`, `r = 8`, `p = 1` und ein abgeleiteter Schlüssel von 64 Byte. Die Parameter werden mit jedem Hash gespeichert, die Verifikation bleibt also möglich, wenn sie später erhöht werden. Weder Benutzer- noch Gruppenpasswörter werden je im Klartext gespeichert oder protokolliert.

Gruppenpasswörter werden genauso gehasht. Sie ermöglichen nur den Gruppen-Login, der in [Benutzer, Gruppen und Berechtigungen](users-groups-permissions.md) beschrieben ist.

## Sitzungen und Token

Eine Anmeldung liefert zwei Dinge:

- Ein **Access Token**: ein mit `JWT_SECRET` signiertes JWT, 15 Minuten gültig. Es trägt die Benutzer-ID, den
  Benutzernamen, das Administrator-Flag, die Art der Authentifizierung und — bei Gruppen-Logins — die Gruppen-ID.
- Ein **Refresh Token**: ein Zufallswert, dessen Hash in der Zeile des Benutzers gespeichert wird. Es lässt den Browser
  ein neues Access Token ohne Passwort holen.

Aus dem einen Refresh-Platz pro Konto folgen zwei Konsequenzen:

- Eine erneute Anmeldung beendet die vorherige Sitzung dieses Kontos.
- Jeder Gruppen-Login teilt sich das Konto `anonymous`, ein neuer Gruppen-Login beendet also die vorherige
  Gruppensitzung.

Das Ersetzen von `JWT_SECRET` macht alle Access Token auf einmal ungültig; Benutzer müssen sich neu anmelden.

## Das Cookie zur Sitzungserneuerung und HTTPS

Das Refresh Token reist in einem Cookie, das so aussieht:

```
refreshToken=<value>; HttpOnly; Secure; Path=/; Max-Age=604800; SameSite=Lax
```

`Max-Age` beträgt sieben Tage. `HttpOnly` hält den Wert von Skripten fern, `SameSite=Lax` begrenzt Cross-Site-Anfragen, und `Secure` ist der Grund, weshalb die Installation über HTTPS erreichbar sein muss: Über reines HTTP verwirft der Browser das Cookie, die Sitzung endet also nach 15 Minuten still, statt erneuert zu werden.

Zwei Einschränkungen gehören ebenfalls hierher:

- Der gespeicherte Refresh-Hash wird geschrieben und gelesen, aber nie gegen ein eigenes Ablaufdatum geprüft; das
  `Max-Age` des Cookies ist die einzige Grenze.
- Das Abmelden löscht das Cookie, aber nicht den gespeicherten Hash. Ein früher ausgestelltes Refresh Token bleibt also
  gültig, und keine administrative Aktion widerruft es heute. Das Ersetzen von `JWT_SECRET` beendet Access Token, nicht
  Refresh Token.

## Brute-Force-Begrenzung

Die Endpunkte `login` und `groupLogin` zählen Fehlversuche pro Schlüssel — `clientIP:username` und `clientIP:groupName`:

- Nach sieben Fehlern in Folge ist der Schlüssel 15 Minuten gesperrt.
- Eine erfolgreiche Anmeldung löscht den Zähler.
- Die Zähler liegen im Speicher, ein Satz pro Backend-Prozess, und ein Neustart löscht sie.
- Kein anderer Endpunkt ist rate-limitiert.

Die Client-IP kommt aus der Verbindung, solange `trustProxy` nicht aktiviert ist — siehe [Das Backend konfigurieren](configuration.md).

## Partitursperren

Das Betreten des edit mode sperrt die Partitur (englisch: score) für 30 Minuten, ohne Heartbeat. Die Sperre wird freigegeben, wenn die Partitur gespeichert oder der edit mode verlassen wird, und läuft von selbst ab. Ihr Zweck ist, einen zweiten Bearbeiter zu warnen, nicht Speicherungen zu serialisieren:

- Der Update-Endpunkt prüft die Sperre nur, wenn der Client das Sperr-Token sendet, eine gezielt gebaute Anfrage kann
  sie also umgehen.
- Speicherungen sind daher last-write-wins; das Kapitel [Die Score Library](../using/score-library.md) sagt dasselbe für
  Benutzer.

## Was das Backend nicht bietet

| Bereich            | Stand                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Security-Header    | Nur `X-Content-Type-Options: nosniff` auf statischen Dateien; kein CSP, HSTS, `X-Frame-Options` oder `Referrer-Policy`      |
| CSRF-Schutz        | Keine Token; die API authentifiziert sich mit dem `Authorization`-Header, und das Refresh-Cookie ist `SameSite=Lax`         |
| Audit              | `login_audit` zeichnet Anmeldungen, Gruppen-Logins, Erneuerungen und Abmeldungen auf, aber nichts in der Anwendung liest es |
| Sitzungsverwaltung | Keine Ansicht aktiver Sitzungen, keine Möglichkeit, eine einzelne Sitzung zu beenden                                        |
| Passwortwechsel    | Nur über `Reset Password` durch einen Administrator                                                                         |
| Health-Endpunkt    | `api?action=health` antwortet ohne Sitzung und nennt Engine, Host, Port und Datenbank                                       |
| Setup-Endpunkte    | `setup` und `testConnection` sind ohne Sitzung erreichbar, solange kein Benutzer existiert                                  |
| Rate Limiting      | Nur die beiden Login-Endpunkte, im Speicher pro Prozess                                                                     |

## Checkliste zur Härtung

1. Liefere die Anwendung über HTTPS aus, terminiert von der Umgebung vor dem Backend.
2. Gib `JWT_SECRET` einen langen Zufallswert und halte ihn im Dienstmanager, nicht in `backend-config.json`.
3. Lass `trustProxy` aus, solange der vorgelagerte Endpunkt nicht den ursprünglichen Host und das Protokoll weiterreicht.
4. Beschränke den Datenbankzugriff auf den Backend-Host und nutze ein eigenes Datenbankkonto.
5. Vergib `World` nur an Partituren, die öffentlich sein dürfen; alles andere bleibt bei Eigentümern und benannten Gruppen.
6. Lege regelmäßig Datenbank-Backups an und teste eine Wiederherstellung.
7. Halte das deployment package aktuell und prüfe dieses Kapitel nach einem Upgrade erneut.

## Verwandte Kapitel

- [Das Backend konfigurieren](configuration.md) dokumentiert `trustProxy`, CORS und `JWT_SECRET`.
- [Benutzer, Gruppen und Berechtigungen](users-groups-permissions.md) erklärt Konten, Gruppen und das Berechtigungsmodell.
- [Fehlerbehebung und bekannte Einschränkungen](../troubleshooting.md) sammelt die oben genannten Einschränkungen.
