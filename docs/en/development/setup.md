# Development Setup

This chapter takes a developer from a fresh clone to a running development environment with both processes, a working database, and debugging in VS Code.

## Requirements

| Component        | Requirement                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Node.js          | 24.15 or 26, as the `engines` field states; `.nvmrc` names 26                                                          |
| Database         | MySQL/MariaDB or PostgreSQL, reachable from the machine                                                                |
| Git              | Needed for the branch-specific database names described below                                                          |
| TLS certificates | `~/.ssh/localhost-key.pem` and `~/.ssh/localhost-cert.pem`; the Vite configuration reads both for the HTTPS dev server |

## The Local Configuration File

```bash
npm install
cp backend-config.example.json backend-config.json
```

`backend-config.json` is ignored by Git. Fill in the database block for the engine you run locally; [Configuring the Backend](../administration/configuration.md) documents every key.

The backend refuses to start without `JWT_SECRET`. `npm run start-debug` sets it to `for-debugging`, which is all a local setup needs. For anything else, export your own value.

## Starting the Two Processes

Development uses two processes:

1. **Backend**: `npm run start` (or `npm run start-debug`), listening on port 3100 by default. It logs `Backend connected: …`, and with `AUTO_MIGRATE=true` also `Branch: …`, the effective database, and either the applied migrations or `All migrations already applied.`
2. **Frontend**: `npm run dev`, serving `https://localhost:5173`. The Vite configuration terminates TLS with the local certificates and proxies `/api` and `/soundLib` to `http://127.0.0.1:3100`, so the browser only ever talks HTTPS.

Open `https://localhost:5173`. The certificate is self-signed, so the browser warns once; VS Code's `Launch` configuration already passes `--allow-insecure-localhost`.

The first start shows the `Backend Setup` dialog, because the database has no tables yet; the start itself applies no migrations. Choose `Initialize Database` to create the schema. [Installing Animada Score Book](../administration/installation.md) describes the wizard.

## Commands

| Command                   | Purpose                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run dev`             | Frontend dev server on `https://localhost:5173`                                            |
| `npm run start`           | Backend with the configured `JWT_SECRET` from the environment                              |
| `npm run start-debug`     | Backend with `JWT_SECRET="for-debugging"`                                                  |
| `npm run build`           | Full production build: SMuFL metrics, font verification, themes, Vite build, bundle budget |
| `npm run check`           | TypeScript check for `src` and `tests`                                                     |
| `npm run lint`            | ESLint over `src`, `tests`, and `build`                                                    |
| `npm run test`            | Vitest unit and integration tests, single run                                              |
| `npm run test:e2e`        | Playwright against the production build                                                    |
| `npm run test:e2e:headed` | The same, with a visible browser                                                           |
| `npm run test:e2e:ui`     | The same, in Playwright's UI mode                                                          |
| `npm run serve:e2e`       | Serve `dist/` on port 4173 for manual checks                                               |
| `npm run db:migrate`      | Apply pending migrations without starting the server                                       |
| `npm run db:cleanup`      | Report branch databases whose branch no longer exists                                      |
| `npm run package`         | Build the deployment package (see below)                                                   |
| `npm run watch`           | TypeScript watcher for the editor                                                          |

`npm run test:e2e` starts `dist/` itself, so it builds the application first; the browser runs against `http://127.0.0.1:4173`, not the dev server.

## Databases in Development

The backend appends the current branch to the database name — `<name>__<branch>` — and uses the configured name unchanged on `main`, on `release*` branches, and under Vitest. A new branch therefore starts with an empty database, and the wizard runs again.

- `npm run db:migrate` applies migrations for the current branch.
- `npm run db:cleanup` lists orphaned branch databases and prints the `DROP DATABASE` statements.
- `Reset Database` in the setup dialog rebuilds the current branch database.

## Building

`npm run build` runs several steps that all write into the repository or `dist/`:

1. `generate:fonts` writes SMuFL metrics into `src/generated` and `public/fonts/smufl`.
2. `verify:fonts` checks that the bundled fonts match those metrics.
3. `generate-themes` writes the DaisyUI theme CSS and the theme name map.
4. `vite build` bundles the application, including the bundle budget check.

`npm run package` builds the frontend and the bundled backend, then writes `dist-package/animada-score-book-<version>.tar.gz`. [Installing Animada Score Book](../administration/installation.md) describes the archive; [Backup, Restore and Upgrades](../administration/backup-restore-upgrades.md) the upgrade path.

## Debugging in VS Code

The repository ships two launch configurations:

- `Launch` opens Chrome on `https://localhost:5173` with `--allow-insecure-localhost` and runs the `tsc: watch` task first, so breakpoints in TypeScript sources match the running code.
- `Debug Current Test File` runs Vitest on the file that is open, with an unlimited test timeout and the debugger attached.

The backend is debugged by starting `npm run start-debug` in a terminal; it is a plain Node process with `tsx`, so a Node launch configuration with that command works as well.

## Related Chapters

- [Architecture and Decisions](architecture.md) maps the codebase.
- [Maintaining This Documentation](documentation.md) covers the handbook conventions.
- [Configuring the Backend](../administration/configuration.md) documents the configuration file.
