# Security Notes

The backend decides who may read and change what. This chapter describes how it protects accounts and sessions, and which parts of a secure deployment remain the operator's job.

## Password Storage

Passwords are hashed with scrypt: a random salt per password, `N = 16384`, `r = 8`, `p = 1`, and a 64-byte derived key. The parameters are stored with each hash, so verification stays possible if they are raised later. Neither user nor group passwords are ever stored or logged in clear text.

Group passwords are hashed the same way. They only enable the group login described in [Users, Groups and Permissions](users-groups-permissions.md).

## Sessions and Tokens

A login returns two things:

- An **access token**: a JWT signed with `JWT_SECRET`, valid for 15 minutes. It carries the user id, the user name, the admin flag, the authentication type, and — for group logins — the group id.
- A **refresh token**: a random value whose hash is stored in the user's row. It lets the browser obtain a new access token without a password.

Two consequences follow from the single refresh slot per account:

- Logging in again ends the previous session of that account.
- Every group login shares the `anonymous` account, so a new group login ends the previous group session.

Replacing `JWT_SECRET` invalidates every access token at once; users have to sign in again.

## The Refresh Cookie and HTTPS

The refresh token travels in a cookie that reads:

```
refreshToken=<value>; HttpOnly; Secure; Path=/; Max-Age=604800; SameSite=Lax
```

`Max-Age` is seven days. `HttpOnly` keeps the value away from scripts, `SameSite=Lax` limits cross-site requests, and `Secure` is the reason the installation has to be reachable over HTTPS: over plain HTTP the browser drops the cookie, so the session ends silently after 15 minutes instead of being renewed.

Two limitations belong here as well:

- The stored refresh hash is written and read but never checked against an expiry of its own; the cookie's `Max-Age` is the only limit.
- Signing out clears the cookie, but not the stored hash. A refresh token that was issued earlier therefore stays valid, and no administrative action revokes it today. Replacing `JWT_SECRET` ends access tokens, not refresh tokens.

## Brute-Force Limiting

The `login` and `groupLogin` endpoints count failed attempts per key — `clientIP:username` and `clientIP:groupName`:

- After seven failures in a row, the key is blocked for 15 minutes.
- A successful login clears the counter.
- The counters live in memory, one set per backend process, and a restart clears them.
- No other endpoint is rate limited.

The client IP comes from the connection unless `trustProxy` is enabled — see [Configuring the Backend](configuration.md).

## Score Locks

Entering edit mode locks the score for 30 minutes, without a heartbeat. The lock is released when the score is saved or edit mode is left, and it expires on its own. Its purpose is to warn a second editor, not to serialize saves:

- The update endpoint checks the lock only when the client sends the lock token, so a crafted request can bypass it.
- Saves are therefore last-write-wins; the [Score Library](../using/score-library.md) chapter states the same for users.

## What the Backend Does Not Provide

| Area               | State                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| Security headers   | Only `X-Content-Type-Options: nosniff` on static files; no CSP, HSTS, `X-Frame-Options`, or `Referrer-Policy` |
| CSRF protection    | No tokens; the API authenticates with the `Authorization` header, and the refresh cookie is `SameSite=Lax`    |
| Audit              | `login_audit` records logins, group logins, refreshes, and logouts, but nothing in the application reads it   |
| Session management | No view of active sessions, no way to end a single session                                                    |
| Password change    | Only through `Reset Password` by an administrator                                                             |
| Health endpoint    | `api?action=health` answers without a session and names the engine, host, port, and database                  |
| Setup endpoints    | `setup` and `testConnection` are reachable without a session while no user exists                             |
| Rate limiting      | Only the two login endpoints, in memory per process                                                           |

## Hardening Checklist

1. Serve the application over HTTPS, terminated by the environment in front of the backend.
2. Give `JWT_SECRET` a long random value and keep it in the service manager, not in `backend-config.json`.
3. Leave `trustProxy` off unless the endpoint in front forwards the original host and protocol.
4. Restrict database access to the backend host and use a dedicated database account.
5. Grant `World` only to scores that may be public; everything else stays with owners and named groups.
6. Take regular database backups and test a restore.
7. Keep the deployment package current, and re-check this chapter after an upgrade.

## Related Chapters

- [Configuring the Backend](configuration.md) documents `trustProxy`, CORS, and `JWT_SECRET`.
- [Users, Groups and Permissions](users-groups-permissions.md) explains accounts, groups, and the permission model.
- [Troubleshooting and Known Limitations](../troubleshooting.md) collects the limitations listed above.
