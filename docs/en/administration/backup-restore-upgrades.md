# Backup, Restore and Upgrades

Everything that cannot be recreated lives in the database or in the files below `public/uploads`. This chapter shows what to protect, how to back it up, and what the backend does on the next start after an upgrade.

## What Lives Where

| Location           | Content                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Database           | Folders, scores and their content, users, groups, group memberships, permission grants, the migration history, and the login audit |
| `public/uploads`   | Files uploaded through the instrument image endpoint                                                                               |
| Browser            | Interface settings, the current score as a local copy, and the selection                                                           |
| Deployment package | Application, music fonts, sound samples, and migrations — replaceable at any time                                                  |

The browser copy is a convenience, not a backup: it belongs to one browser profile and one device, and clearing site data removes it.

## Backing Up the Database

Use the effective database name, which the backend prints at startup as `Backend initialised: <engine> @ <host>:<port>/<database>`. In development that can be a branch database, not the configured name.

MySQL or MariaDB:

```bash
mysqldump --single-transaction --routines --triggers -u animada -p animada > animada-$(date +%F).sql
```

PostgreSQL:

```bash
pg_dump -U animada -Fc animada > animada-$(date +%F).dump
```

Both commands include the schema, the data, and the `migration_history` table, which the next start relies on. `--single-transaction` keeps a MySQL dump consistent without locking the tables, as long as the tables use InnoDB.

Copy the upload directory as well if files were ever uploaded:

```bash
tar -czf animada-uploads-$(date +%F).tar.gz public/uploads
```

## Restoring

1. Stop the backend.
2. Recreate an empty database and restore into it.

   ```bash
   mysql -u animada -p animada < animada-2026-10-27.sql
   pg_restore -U animada -d animada animada-2026-10-27.dump
   ```

3. Restore `public/uploads` next to the application.
4. Start the backend and check the log: `All migrations already applied.` means the dump matches the version of the code.
5. Verify the result: sign in, open a score, check a group grant in the permission editor, and play a bar.

A restore into a database that already holds tables fails on the first duplicate table. Drop and recreate the database first, or restore into a new name and point `backend-config.json` at it.

## Migrations on Startup

The backend applies the schema itself:

- On start it creates or reads `migration_history` and applies every file from `migrations/` that it has not recorded yet, in file-name order.
- Each applied file is stored with its SHA-256 checksum.
- A migration file may carry `-- @mysql` and `-- @postgres` sections; the runner executes only the sections for the configured engine, plus everything outside such markers.
- Pending migrations run in the background right after the process starts; the log lists them, and `Backend initialised: …` appears once the schema is ready.

## A Modified Migration File

If a migration file changes after it has been applied — during a rebase, for example — the start fails with:

```
Migration "<file>" was modified after it was applied.
Drop the branch database and restart the server to re-apply all migrations.
```

There are no down migrations and no repair step. The only ways forward are restoring a backup that matches the code, or rebuilding the database, which loses every user and score. This is why `migrations/` is treated as append-only.

## Upgrading Between Releases

1. Stop the backend.
2. Unpack the new package into a new directory.
3. Copy `backend-config.json` and `public/uploads` from the old installation.
4. Start the backend with `node server.js`. Pending migrations run automatically.

After the upgrade:

- The browser may still hold the previous version of the application; a reload fetches the new one.
- Sessions survive as long as `JWT_SECRET` stays the same.
- The footer shows the version of the application the browser loaded, so a reload after the upgrade confirms the new version.

## Branch Databases in Development

On a checkout, the backend appends the current branch to the database name, as described in [Configuring the Backend](configuration.md). Two tools help there:

- `npm run db:cleanup` lists databases whose branch no longer exists and prints the `DROP DATABASE` commands to run manually.
- `npm run db:migrate` applies migrations without starting the server.

A checksum mismatch in development usually means the branch was rebased; dropping the branch database is the intended fix.

## Resetting the Database as a Last Resort

`Reset Database` in the `Backend Setup` dialog drops every table and rebuilds the schema. Afterwards the seed data and the shared `anonymous` account exist again, and `Finish Installation` asks for the first administrator.

Everything else is gone: scores, users, groups, grants, and the login audit. Export what you need and take a backup before using it.

## Related Chapters

- [Installing Animada Score Book](installation.md) covers the first start and the wizard.
- [Configuring the Backend](configuration.md) explains the database settings and branch databases.
- [Troubleshooting and Known Limitations](../troubleshooting.md) lists the limitations around migrations and backups.
