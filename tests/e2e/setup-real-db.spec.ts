/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/* eslint-disable no-restricted-syntax */

import { expect, test } from "@playwright/test";
import { ChildProcess, spawn } from "node:child_process";
import { createConnection, type Connection } from "mysql2/promise";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const testDbName = "animada_e2e_setup_test";
const dbUser = process.env.DB_USER ?? "root";
const dbPassword = process.env.DB_PASSWORD ?? "localRoot#123";
const dbHost = process.env.DB_HOST ?? "127.0.0.1";
const dbPort = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

// Use a different port to avoid conflicts with the dev server on 3100.
const testBackendPort = 3199;
const testBackendUrl = `http://127.0.0.1:${testBackendPort}`;

let backendProcess: ChildProcess | undefined;
let dbConnection: Connection | undefined;

const waitForBackend = async (timeoutMs = 30000): Promise<void> => {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        try {
            const response = await fetch(`${testBackendUrl}/api?action=health`);

            if (response.ok) {
                return;
            }
        } catch {
            // Server not ready yet.
        }

        await new Promise((r) => {
            setTimeout(r, 500);
        });
    }

    throw new Error("Backend did not become ready within timeout");
};

test.describe.serial("Setup: real database integration", () => {
    test.beforeAll(async () => {
        // Create a fresh test database.
        dbConnection = await createConnection({
            host: dbHost, port: dbPort, user: dbUser, password: dbPassword,
        });

        await dbConnection.execute(`DROP DATABASE IF EXISTS \`${testDbName}\``);
        const createDb = `CREATE DATABASE \`${testDbName}\``
            + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci";

        await dbConnection.execute(createDb);
        await dbConnection.end();
        dbConnection = undefined;

        // Ensure uploads directory exists.
        const uploadsPath = resolve(process.cwd(), "public", "uploads", "instruments");

        if (!existsSync(uploadsPath)) {
            mkdirSync(uploadsPath, { recursive: true });
        }

        // The Playwright webServer already built dist/ — we just need the backend to serve it.

        // Start the backend with the test database name so it can auto-initialize.
        // The setup dialog no longer has editable form fields — config comes from env vars.
        backendProcess = spawn("npx", ["tsx", "src/server/backend.ts"], {
            env: {
                ...process.env,
                JWT_SECRET: "e2e-test-secret",
                PORT: String(testBackendPort),
                HOST: "127.0.0.1",
                DB_ENGINE: "mysql",
                DB_HOST: dbHost,
                DB_PORT: String(dbPort),
                DB_NAME: testDbName,
                DB_USER: dbUser,
                DB_PASSWORD: dbPassword,
            },
            stdio: "pipe",
        });

        backendProcess.stdout?.on("data", (data: Buffer) => {
            console.log(`[backend] ${data.toString().trim()}`);
        });

        backendProcess.stderr?.on("data", (data: Buffer) => {
            console.error(`[backend:err] ${data.toString().trim()}`);
        });

        await waitForBackend();
    });

    test.afterAll(async () => {
        if (backendProcess) {
            backendProcess.kill("SIGTERM");
            await new Promise<void>((resolvePromise) => {
                backendProcess!.on("exit", () => {
                    resolvePromise();
                });
                setTimeout(() => {
                    resolvePromise();
                }, 5000);
            });
        }

        dbConnection = await createConnection({
            host: dbHost, port: dbPort, user: dbUser, password: dbPassword,
        });
        await dbConnection.execute(`DROP DATABASE IF EXISTS \`${testDbName}\``);
        await dbConnection.end();
    });

    test("full setup flow: auto-init → admin", async ({ page }) => {
        // Navigate directly to the test backend — it serves both API and frontend.
        await page.goto(testBackendUrl);

        // The backend auto-initializes because the database is reachable via env vars.
        // The setup dialog appears briefly showing the config, then the admin setup dialog appears.
        await expect(page.locator("#adminSetupDialog")).toBeVisible({ timeout: 30000 });
        await expect(page.locator("#adminSetupDialog")).toContainText("Finish Installation");

        // Fill and submit the admin creation form.
        await page.locator("#admin-username").fill("testadmin");
        await page.locator("#admin-password").fill("testpass123");
        await page.locator("#admin-confirm").fill("testpass123");
        await page.locator("#admin-display").fill("Test Admin");
        await page.locator("#admin-group").fill("Test Group");

        await page.click("#admin-setup-create");

        // After creation the app should load.
        await page.waitForTimeout(3000);
    });

    test("schema verification: all tables and required columns exist", async () => {
        // Verify the backend reports initialized.
        const response = await fetch(`${testBackendUrl}/api?action=health`);
        const health = await response.json() as { initialized: boolean; };

        expect(health.initialized).toBe(true);

        // Verify schema by querying the test database directly.
        const conn = await createConnection({
            host: dbHost, port: dbPort, user: dbUser, password: dbPassword, database: testDbName,
        });

        const tables = [
            "folders", "scores", "instruments", "instrument_images", "users",
            "login_audit", "groups", "user_groups", "permissions", "entity_groups",
        ];

        for (const table of tables) {
            const [rows] = await conn.query(
                "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = ? AND table_name = ?",
                [testDbName, table],
            ) as [Array<{ cnt: number; }>, unknown];

            expect(rows[0].cnt, `Table '${table}' should exist`).toBe(1);
        }

        // Verify users table has required columns.
        const [columns] = await conn.query(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'",
            [testDbName],
        ) as [Array<{ COLUMN_NAME: string; }>, unknown];

        const columnNames = columns.map((c) => {
            return c.COLUMN_NAME;
        });

        expect(columnNames).toContain("refresh_token_hash");
        expect(columnNames).toContain("auth_type");
        expect(columnNames).toContain("group_id");

        // Verify the admin user was created.
        const [users] = await conn.query(
            "SELECT username, display_name FROM users WHERE username = ?",
            ["testadmin"],
        ) as [Array<{ username: string; display_name: string; }>, unknown];

        expect(users.length).toBe(1);
        expect(users[0].username).toBe("testadmin");

        await conn.end();
    });
});
