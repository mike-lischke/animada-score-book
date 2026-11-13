/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/* eslint-disable no-restricted-syntax */

import { expect, test } from "@playwright/test";
import { ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { resolve } from "node:path";
import { createConnection, type Connection } from "mysql2/promise";

const testDbName = "animada_e2e_setup_test";
const dbUser = process.env.DB_USER ?? "root";
const dbPassword = process.env.DB_PASSWORD ?? "localRoot#123";
const dbHost = process.env.DB_HOST ?? "127.0.0.1";
const dbPort = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

// Use a different port to avoid conflicts with the dev server on 3100.
const testBackendPort = 3199;
const testBackendUrl = `http://127.0.0.1:${testBackendPort}`;

/**
 * A minimal SMTP server that keeps the message bodies the backend sends. It answers every command a mail client
 * needs and advertises neither STARTTLS nor authentication, so nodemailer delivers the message in clear text.
 */
class SmtpSink {
    /** The bodies of the messages the backend sent. */
    public readonly messages: string[] = [];

    private constructor(private readonly server: Server) { }

    public static async start(): Promise<SmtpSink> {
        const server = createServer();
        const sink = new SmtpSink(server);

        server.on("connection", (socket) => {
            sink.accept(socket);
        });

        await new Promise<void>((resolvePromise) => {
            server.listen(0, "127.0.0.1", () => {
                resolvePromise();
            });
        });

        return sink;
    }

    public get port(): number {
        const address = this.server.address();
        if (address === null || typeof address === "string") {
            throw new Error("The mail sink is not listening on a TCP port.");
        }

        return address.port;
    }

    public async close(): Promise<void> {
        await new Promise<void>((resolvePromise) => {
            this.server.close(() => {
                resolvePromise();
            });
        });
    }

    /**
     * @param socket The connection a mail client opened.
     */
    private accept(socket: Socket): void {
        let buffer = "";
        let inData = false;
        let message = "";

        socket.write("220 e2e-sink ESMTP\r\n");

        socket.on("data", (chunk: Buffer) => {
            buffer += chunk.toString("utf-8");

            let lineEnd = buffer.indexOf("\r\n");
            while (lineEnd >= 0) {
                const line = buffer.slice(0, lineEnd);
                buffer = buffer.slice(lineEnd + 2);

                if (inData) {
                    if (line === ".") {
                        inData = false;
                        this.messages.push(message);
                        message = "";
                        socket.write("250 OK\r\n");
                    } else {
                        // A line starting with a dot carries one more dot, which the transport added.
                        message += `${line.startsWith("..") ? line.slice(1) : line}\r\n`;
                    }
                } else {
                    this.answer(socket, line, () => {
                        inData = true;
                    });
                }

                lineEnd = buffer.indexOf("\r\n");
            }
        });
    }

    /**
     * @param socket The connection to answer on.
     * @param line One command line the client sent.
     * @param beginData Called when the client starts a message body.
     */
    private answer(socket: Socket, line: string, beginData: () => void): void {
        const command = line.split(" ")[0].toUpperCase();

        switch (command) {
            case "EHLO": {
                socket.write("250-e2e-sink\r\n250 8BITMIME\r\n");
                break;
            }

            case "DATA": {
                socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
                beginData();
                break;
            }

            case "QUIT": {
                socket.write("221 Bye\r\n");
                socket.end();
                break;
            }

            default: {
                socket.write("250 OK\r\n");
            }
        }
    }
}

/**
 * @param message A MIME message as the transport wrote it.
 *
 * @returns The message with its quoted-printable escapes resolved, so long URLs become contiguous again.
 */
const decodeQuotedPrintable = (message: string): string => {
    return message
        .replaceAll("=\r\n", "")
        .replace(/=([0-9A-F]{2})/gi, (match, hex: string) => {
            return String.fromCharCode(Number.parseInt(hex, 16));
        });
};

/**
 * @param message A MIME message as the transport wrote it.
 *
 * @returns The confirmation link it carries.
 */
const confirmationLink = (message: string): string => {
    const link = /https?:\/\/\S*confirmRegistration\S*/u.exec(decodeQuotedPrintable(message));

    if (link === null) {
        throw new Error(`The message carries no confirmation link:\n${message}`);
    }

    return link[0].replace(/[>"']+$/, "");
};

let backendProcess: ChildProcess | undefined;
let dbConnection: Connection | undefined;
let mailSink: SmtpSink | undefined;

const waitForBackend = async (timeoutMs = 30000): Promise<void> => {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        try {
            const response = await fetch(`${testBackendUrl}/api?action=health`);
            const health = await response.json() as { initialized?: boolean; };

            if (response.ok && health.initialized) {
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

        // Every account needs a confirmation mail, so the backend needs a mail server that accepts one.
        mailSink = await SmtpSink.start();

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
                MAIL_HOST: "127.0.0.1",
                MAIL_PORT: String(mailSink.port),
                MAIL_SECURE: "false",
                MAIL_FROM: "Animada Score Book <no-reply@example.com>",
                MAIL_PUBLIC_URL: testBackendUrl,
                REGISTRATION_ENABLED: "true",
                VITEST: "true",
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

        await mailSink?.close();

        dbConnection = await createConnection({
            host: dbHost, port: dbPort, user: dbUser, password: dbPassword,
        });
        await dbConnection.execute(`DROP DATABASE IF EXISTS \`${testDbName}\``);
        await dbConnection.end();
    });

    test("full setup flow: auto-init → confirmation mail → admin", async ({ page }) => {
        // Navigate directly to the test backend — it serves both API and frontend.
        await page.goto(testBackendUrl);

        // The backend auto-initializes because the database is reachable via env vars.
        // The setup dialog appears briefly showing the config, then the admin setup dialog appears.
        await expect(page.locator("#adminSetupDialog")).toBeVisible({ timeout: 30000 });
        await expect(page.locator("#adminSetupDialog")).toContainText("Finish Installation");

        // Fill and submit the admin creation form.
        await page.locator("#admin-email").fill("testadmin@example.com");
        await page.locator("#admin-password").fill("testpass123");
        await page.locator("#admin-confirm").fill("testpass123");
        await page.locator("#admin-display").fill("Test Admin");
        await page.locator("#admin-group").fill("Test Group");

        await page.click("#admin-setup-create");

        // No account exists yet: the dialog points at the inbox instead.
        await expect(page.locator("#adminSetupDialog")).toContainText("Check Your Inbox", { timeout: 15000 });
        await expect(page.locator("#adminSetupDialog")).toContainText("testadmin@example.com");
        await expect(page.locator("#adminSetupDialog")).toContainText("Then reload this page yourself");

        // The confirmation mail is the only way to finish the installation.
        await expect.poll(() => {
            return mailSink?.messages.length ?? 0;
        }, { timeout: 15000 }).toBe(1);

        const firstLink = confirmationLink(mailSink!.messages[0]);

        // `Send Again` mails a new link and retires the one that was sent before.
        await page.click("#admin-setup-resend");
        await expect(page.locator("#adminSetupDialog")).toContainText("A new confirmation link was sent.", {
            timeout: 15000,
        });
        await expect.poll(() => {
            return mailSink?.messages.length ?? 0;
        }, { timeout: 15000 }).toBe(2);

        const retired = await page.request.get(firstLink);
        expect(retired.status()).toBe(410);

        await page.goto(confirmationLink(mailSink!.messages[1]));

        // The confirmation page sets the session cookie and leads back into the application.
        await page.waitForURL(`${testBackendUrl}/`, { timeout: 20000 });
        await expect(page.locator("#appRoot")).toBeVisible({ timeout: 30000 });
    });

    test("schema verification: all tables and required columns exist", async () => {
        // Verify the backend reports initialized.
        const response = await fetch(`${testBackendUrl}/api?action=health`);
        const health = await response.json() as { initialized: boolean; mailConfigured?: boolean; };

        expect(health.initialized).toBe(true);
        expect(health.mailConfigured).toBe(true);

        // Verify schema by querying the test database directly.
        const conn = await createConnection({
            host: dbHost, port: dbPort, user: dbUser, password: dbPassword, database: testDbName,
        });

        const tables = [
            "folders", "scores", "instruments", "instrument_images", "users", "email_verifications",
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

        expect(columnNames).toContain("email");
        expect(columnNames).toContain("email_verified");
        expect(columnNames).toContain("refresh_token_hash");
        expect(columnNames).toContain("auth_type");
        expect(columnNames).toContain("group_id");

        // Verify the admin user was created by opening the confirmation link, and nothing is left pending.
        const [users] = await conn.query(
            "SELECT email, display_name, email_verified FROM users WHERE email = ?",
            ["testadmin@example.com"],
        ) as [Array<{ email: string; display_name: string; email_verified: number; }>, unknown];

        expect(users.length).toBe(1);
        expect(users[0].email).toBe("testadmin@example.com");
        expect(Boolean(users[0].email_verified)).toBe(true);

        const [pending] = await conn.query(
            "SELECT COUNT(*) AS cnt FROM email_verifications",
        ) as [Array<{ cnt: number; }>, unknown];

        expect(pending[0].cnt).toBe(0);

        await conn.end();
    });
});
