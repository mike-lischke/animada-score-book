---
name: server-change
description: >-
  Use when: the user says they changed server files, "I modified the backend",
  "check server changes", "what after server changes", or after editing any file
  under src/server/. Runs a post-change checklist: restart reminders, schema
  migration checks, and relevant server tests.
---

# Server Change Checklist

Run this after modifying any file under `src/server/`.

## 1. Check for Schema Changes

Review the git diff (or recent edits) for changes to `createTablesSQL` in `mysql-adapter.ts` or `postgres-adapter.ts`.
If any new columns, tables, or constraints were added:

- **Tell the user** they need to run a manual SQL migration.
- Quote the exact `ALTER TABLE` or `CREATE TABLE` statement needed.
- Reminder: MySQL does not support `IF NOT EXISTS` for `ALTER TABLE ADD COLUMN` — tell the user to check with `SHOW COLUMNS FROM <table>` first.
- Note that `postgres-adapter.ts` must stay in sync with `mysql-adapter.ts` — flag any drift.

## 2. Restart Reminder

The backend server does NOT auto-reload. **Always remind the user:**
> Restart the server: `npm run start-debug`

## 3. Run Server Tests

- Run `npm run test -- tests/server/` to verify auth, token handling, and route logic.
- If any integration/e2e tests exercise the changed endpoints, suggest running those too.

## 4. Security Check (if modifying auth or routes)

Reference the known unfixed issues from the security audit (2025-06-30):
- `handleRefresh`: x-auth-type and x-group-id headers are client-controlled — do not trust them.
- `handleTestConnection`: must be authenticated.
- `handleListUsers`: must be admin-only.
- `handleUpdateGroup`: adminId must not be reassignable by non-admins.
- Request body size limits: `readJsonBody`/`readRawBody` should have a maxSize.
- `handleSetup`: auth check required when users exist.

If the change touches any of these areas, flag the relevant issue.

## 5. Config Changes

If `backend-config.json` format or `config.ts` defaults changed, remind the user to update their local `backend-config.json`.
Note which env vars (`ALLOWED_ORIGINS`, `TRUST_PROXY`, `DB_*`, `JWT_SECRET`) are affected.
