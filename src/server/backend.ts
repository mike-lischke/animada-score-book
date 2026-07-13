/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/* eslint-disable no-restricted-syntax */

import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";

import { convertErrorToString } from "../core/utils.js";
import { Auth } from "./Auth.js";

import { loadConfig, uploadsPath } from "./config.js";
import { RequestContext } from "./RequestContext.js";
import { Router, type IServerConfig } from "./Router.js";

let config: IServerConfig;
let auth: Auth;

let router: Router;

const main = (): void => {
    config = loadConfig();
    router = new Router(config);
    auth = new Auth(router.createAdapter());
    router.auth = auth;

    // Try to initialise with saved or default config on startup.
    auth.adapter.testConnection(config.database).then((result) => {
        if (result.success) {
            return auth.adapter.initialize(config.database).then(() => {
                const { engine, host, port, database } = config.database;
                console.log(
                    `Backend initialised: ${engine} @ ${host}:${port}/${database}`,
                );

                // Load seed only if tables are empty (avoid duplicates).
                return auth.adapter.query<{ cnt: number; }>(
                    "SELECT COUNT(*) AS cnt FROM folders",
                ).then((rows) => {
                    if ((rows[0]?.cnt ?? 0) === 0) {
                        return router.seedIfExists(auth.adapter);
                    }

                    return undefined;
                }).then(() => {
                    return router.seedAnonymousUser(auth.adapter);
                });
            });
        }

        console.log(`Could not auto-connect: ${result.error ?? "unknown reason"}`);
        console.log("Waiting for setup from frontend…");

        return undefined;
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
