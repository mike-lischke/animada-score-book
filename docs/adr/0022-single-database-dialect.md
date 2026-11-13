# ADR-0022: Support one SQL dialect, the one MySQL and MariaDB share

- Status: accepted
- Date: 2026-11-13
- Related: issue #67, `src/server/database.ts`, `src/server/mysql-adapter.ts`, `migrations/`, `build/seed.ts`, `build/dump-seed.ts`
- Relevant when: database engine, adapter, SQL dialect, PostgreSQL, migrations, seed data, backend configuration

## Context

The backend carried two adapters, one for MySQL/MariaDB and one for PostgreSQL, while every statement was written in MySQL syntax. PostgreSQL rejects backticks, folds camelCase result aliases to lower case, has no `INSERT IGNORE` or `ON DUPLICATE KEY UPDATE`, and reads backslashes in literals differently. Translating statements in the adapter covered the syntax but not the semantics: collations, result types, and conflict targets still differ, and none of it could be verified because no PostgreSQL server was part of development or CI. Correct support would have meant either every statement in two dialects or a query builder, plus a second database in CI — for an engine no installation was known to run.

## Decision

We will support one SQL dialect: the one MySQL and MariaDB share. `DatabaseEngine` names only `MySQL` and `MariaDB`, one adapter serves both, and statements are written directly in MySQL syntax, including `INSERT IGNORE` and `ON DUPLICATE KEY UPDATE`. The PostgreSQL adapter and the `pg` dependency are gone. No installation ever ran on PostgreSQL, so the migrations lost their `-- @postgres` sections and the runner no longer splits a file by engine. The seed dump is a plain MySQL script. A configuration that names an unsupported engine is reported as unusable instead of silently falling back to MySQL.

## Invariants

- One adapter, MySQL syntax in every statement; no abstraction whose only purpose was a second dialect.
- `DatabaseEngine` has no member besides `MySQL` and `MariaDB`; an unknown value makes the configuration unusable.
- A migration file holds MySQL DDL only; the runner executes it as written.
- Nothing in the backend runs against PostgreSQL; it is not a supported configuration.

## Alternatives considered

| Option | Why not / why chosen |
| --- | --- |
| One dialect (chosen) | Smallest surface; every statement runs as written, on hardware we can test. |
| Translate MySQL to PostgreSQL in the adapter | Rejected: syntax-only translation leaves collation, result types, and conflict semantics different, and nothing verifies it. |
| Write every statement in both dialects | Rejected: double maintenance and drift for an engine without a known installation. |
| Query builder (e.g. Kysely) | Rejected for now: would cover both dialects without duplication, but rewrites every query for a benefit nobody currently needs. |

## Consequences

- Positive: a statement means what it says, and the server has one code path that CI exercises.
- Trade-off: the statements that actually ran are unchanged, but the migration files are not, so a database that already applied them reports a checksum mismatch. Its `migration_history` rows must be updated to the new checksums once — the schema they describe is the same.
- Trade-off: an installation that used PostgreSQL cannot continue without a manual export/import; there is no migration path.
- Follow-up / verification: documentation that names PostgreSQL is updated at the next release; restoring support means a new ADR, not a patch to this one.
