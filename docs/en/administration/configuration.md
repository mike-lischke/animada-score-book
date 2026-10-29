# Configuring the Backend

The backend reads one file, `backend-config.json`, from the directory it is started in. Environment variables override the file, which lets a service manager keep secrets out of it. Nothing else holds backend settings.

## The Configuration File

| Key                 | Default         | Effect                                                                             |
| ------------------- | --------------- | ---------------------------------------------------------------------------------- |
| `host`              | `0.0.0.0`       | Interface the process listens on                                                   |
| `port`              | `3100`          | Port it listens on                                                                 |
| `database.engine`   | `mysql`         | One of `mysql`, `mariadb`, `postgres`                                              |
| `database.host`     | empty           | Database server                                                                    |
| `database.port`     | `0`             | Database port; set it explicitly (`3306` for MySQL/MariaDB, `5432` for PostgreSQL) |
| `database.database` | empty           | Database name                                                                      |
| `database.user`     | empty           | Database account                                                                   |
| `database.password` | empty           | Password of that account                                                           |
| `soundLibPath`      | `public/sounds` | Directory served as the sound library, relative to the working directory           |
| `allowedOrigins`    | none            | Origins that receive CORS headers                                                  |
| `trustProxy`        | `false`         | Whether forwarded headers from a proxy are trusted                                 |
| `autoMigrate`       | `false`         | Whether the start applies pending migrations instead of leaving them to the dialog |
The example file `backend-config.example.json` in the package lists all of them with these defaults. Copy it and adjust the database block; the [installation chapter](installation.md) shows a minimal configuration.

The installation dialog in the browser only displays these values. Changing them means editing the file and restarting the process.

## Environment Variables

All values except `soundLibPath` can be overridden from the environment. The environment wins over the file, and unset variables fall back to the file and then to the default.

| Variable          | Overrides           | Notes                                                 |
| ----------------- | ------------------- | ----------------------------------------------------- |
| `HOST`            | `host`              | Interface to bind                                     |
| `PORT`            | `port`              | Port, as a number                                     |
| `ALLOWED_ORIGINS` | `allowedOrigins`    | Comma-separated list, surrounding spaces are trimmed  |
| `TRUST_PROXY`     | `trustProxy`        | Only the value `true` enables it                      |
| `DB_ENGINE`       | `database.engine`   | Ignored when it is not one of the three known engines |
| `DB_HOST`         | `database.host`     |                                                       |
| `DB_PORT`         | `database.port`     | As a number                                           |
| `DB_NAME`         | `database.database` |                                                       |
| `DB_USER`         | `database.user`     |                                                       |
| `DB_PASSWORD`     | `database.password` |                                                       |
| `JWT_SECRET`      | —                   | Required; see below                                   |
| `AUTO_MIGRATE`    | `autoMigrate`       | `true` applies migrations on start                    |

## The JWT Secret

`JWT_SECRET` has no counterpart in the configuration file on purpose: it is the key that signs every session token, and the backend refuses to start without it. Provide it through the service manager, for example `JWT_SECRET="<long random value>" node server.js`.

Replacing the secret invalidates all tokens that were issued with the old one, so every user has to sign in again. [Security Notes](security.md) explains tokens, lifetimes, and the refresh cookie.

## Database Settings

- `engine` selects the adapter. `mysql` and `mariadb` share one adapter; `postgres` uses the other.
- `host`, `port`, `database`, `user`, and `password` are passed to that adapter unchanged, so the database must already exist, together with an account that may create tables, indexes, and foreign keys in it.
- On start the backend tests the connection. When it succeeds, it logs `Backend connected: <engine> @ <host>:<port>/<database>`; with `"autoMigrate": true` it applies the pending migrations and logs `Backend initialised: …` instead. When the connection fails, it logs `Could not auto-connect: …` and `Waiting for setup from frontend…`, keeps listening, and the browser reports that the database is unreachable.
- Without `autoMigrate` a database without the application tables stays empty until someone chooses `Initialize Database` in the browser, which applies the migrations and seeds the demo data.

The database can be rebuilt from the schema at any time; [Backup, Restore and Upgrades](backup-restore-upgrades.md) covers that.

## Separate Databases per Branch in Development

In a checkout, the backend does not always use the configured database name:

- On `main` and on branches starting with `release`, it uses `database.database` as configured.
- On any other branch it appends the branch name: `<name>__<branch>`, with characters outside `a-z`, `A-Z`, `0-9`, `_`, and `-` replaced by `_`.
- Under Vitest, the configured name is used unchanged.

This keeps experimental data away from the real database. `npm run db:cleanup` scans for databases whose branch no longer exists and reports them.

## Allowed Origins

`allowedOrigins` is empty by default, and an empty list sends no CORS headers at all. Add the origins that a separate frontend or tool may use:

```json
"allowedOrigins": ["https://scores.example.org", "http://localhost:5173"]
```

For a matching `Origin` the backend echoes it in `Access-Control-Allow-Origin`, adds `Vary: Origin`, and allows the methods `GET`, `POST`, `PUT`, `DELETE`, and `OPTIONS` with the headers `Content-Type` and `Authorization`. Requests without an `Origin` header are unaffected.

The application itself is served from the backend's own origin, so it needs no entry here.

## Proxy Trust

`trustProxy` stays `false` unless the backend sits behind something that terminates TLS and forwards the original request:

- With `false`, the backend uses the address of the connection for the client IP and ignores `X-Forwarded-For` and `X-Forwarded-Proto`.
- With `true`, it reads those headers.

The client IP reaches the brute-force limiter and the login audit, so enabling this behind a trusted proxy keeps those records correct. Behind no proxy it would let a client claim any address.

## Static Files and the Sound Library

The backend serves the application and its assets itself:

- `dist/` holds the built browser application. Requests without a matching file fall back to `dist/index.html`, so links into the application work.
- `public/` is served as-is, including music fonts and the uploaded instrument images below `public/uploads/instruments`. The backend creates that directory on start when it is missing.
- `soundLibPath` is resolved against the working directory and served under `/soundLib/`. The default points at the samples the package ships; point it elsewhere to use a different sound library.

## Related Chapters

- [Installing Animada Score Book](installation.md) creates and starts the installation.
- [Security Notes](security.md) covers the JWT secret, tokens, and hardening.
- [Development Setup](../development/setup.md) explains the development configuration, including the branch databases.
