/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/* eslint-disable no-restricted-syntax */

import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";

import { convertErrorToString } from "../core/utils.js";
import { runMigrations } from "../../build/migration.js";
import { Auth } from "./Auth.js";

import { loadConfig, uploadsPath } from "./config.js";
import { type IDatabaseAdapter } from "./database.js";
import { RequestContext } from "./RequestContext.js";
import { Router, type IServerConfig } from "./Router.js";

let config: IServerConfig;
let auth: Auth;

let router: Router;

/**
 * Tells the operator when the demo catalog cannot be served, because the configuration or the database does not
 * line up. A demo that silently offers nothing is what makes the hint necessary.
 *
 * @param adapter The database adapter, after the schema is ready.
 */
const reportDemoCatalog = async (adapter: IDatabaseAdapter): Promise<void> => {
    const { scoreIds } = config.demo;

    if (scoreIds.length === 0) {
        console.log(
            "No demo catalog configured. Add \"demo\": { \"scoreIds\": [...] } to backend-config.json "
            + "to offer curated scores to visitors without an account.",
        );

        return;
    }

    const placeholders = scoreIds.map(() => {
        return "?";
    }).join(", ");

    const rows = await adapter.query<{ id: number; }>(
        `SELECT id FROM scores WHERE id IN (${placeholders})`,
        scoreIds,
    );

    const existing = new Set(rows.map((row) => {
        return row.id;
    }));
    const missing = scoreIds.filter((id) => {
        return !existing.has(id);
    });

    if (missing.length > 0) {
        console.warn(`The demo catalog lists scores that do not exist: ${missing.join(", ")}.`);
    }
};

const main = (): void => {
    config = loadConfig();
    router = new Router(config);
    auth = new Auth(router.createAdapter());
    router.auth = auth;

    // Connect with the saved or default config on startup and bring the schema up to date. The database account
    // needs the rights for that; a failed connection leaves the setup dialog to the browser.
    auth.adapter.testConnection(config.database).then((result) => {
        if (!result.success) {
            console.log(`Could not auto-connect: ${result.error ?? "unknown reason"}`);
            console.log("Waiting for setup from frontend…");

            return undefined;
        }

        return runMigrations(config.database).then((effectiveDb) => {
            // Use the branch-specific database name.
            config.database.database = effectiveDb;

            return auth.adapter.initialize(config.database).then(() => {
                const { engine, host, port, database } = config.database;
                console.log(
                    `Backend initialised: ${engine} @ ${host}:${port}/${database}`,
                );

                // Both seeding steps are idempotent — the seed data lands only in an empty
                // database, the anonymous user only when it is missing.
                return router.seedIfExists(auth.adapter).then(() => {
                    return router.seedAnonymousUser(auth.adapter);
                }).then(() => {
                    return reportDemoCatalog(auth.adapter);
                });
            });
        });
    }).catch((e: unknown) => {
        console.warn("Database init failed:", convertErrorToString(e));
        console.log("Waiting for setup from frontend…");
    });

    // Ensure uploads directory exists.
    if (!existsSync(uploadsPath)) {
        mkdirSync(uploadsPath, { recursive: true });
    }

    const server = createServer((req, res) => {
        void router.handleRequest(req, res);
    });

    // Keep track of open connections for graceful shutdown.
    const connections = new Set<import("node:net").Socket>();

    server.on("connection", (socket) => {
        connections.add(socket);

        socket.once("close", () => {
            connections.delete(socket);
        });
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
            console.error(`Port ${config.port} is already in use.`);
            process.exit(1);
        }

        throw err;
    });

    server.listen(config.port, config.host, () => {
        const displayHost = config.host === "0.0.0.0" ? "127.0.0.1" : config.host;

        console.log(
            `Backend server listening on http://${displayHost}:${config.port}`
            + ` (bound to ${config.host}:${config.port})`,
        );
    });

    // Periodic database liveness check — logs a warning if the database becomes unreachable
    // between requests, and a recovery message when it comes back. The health endpoint also
    // performs a fresh ping on every call.
    let dbWasDown = false;

    const dbPingInterval = setInterval(() => {
        if (auth.adapter.isInitialized()) {
            auth.adapter.ping().then(() => {
                if (dbWasDown) {
                    dbWasDown = false;
                    console.log("Database connection restored.");
                }
            }).catch((e: unknown) => {
                if (!dbWasDown) {
                    dbWasDown = true;
                    console.warn(`Database liveness check failed: ${(e as Error).message}`);
                }
            });
        }
    }, 30_000);

    // Allow the event loop to exit even with the interval active (Node 22.12+).
    if (typeof dbPingInterval.unref === "function") {
        dbPingInterval.unref();
    }

    const shutdown = () => {
        console.log("\nShutting down…");

        // Stop accepting new connections (Node 18+).
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (server.closeIdleConnections) {
            server.closeIdleConnections();
        }

        // Destroy all keep-alive connections.
        for (const socket of connections) {
            socket.destroy();
        }

        connections.clear();

        RequestContext.destroyRateLimiter();

        auth.adapter.shutdown().then(() => {
            server.close(() => {
                process.exit(0);
            });
        }).catch(() => {
            process.exit(1);
        });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
};

main();
