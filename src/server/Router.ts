/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/* eslint-disable no-restricted-syntax */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";

import { convertErrorToString } from "../core/utils.js";
import { Auth } from "./Auth.js";
import { DatabaseEngine, schemaVersion, type IDatabaseAdapter, type IDatabaseConfig } from "./database.js";
import { MySqlAdapter } from "./mysql-adapter.js";
import { PostgresAdapter } from "./postgres-adapter.js";
import { type IServerConfig } from "./config.js";
import { RequestContext } from "./RequestContext.js";
import { ScoreRoutes } from "./ScoreRoutes.js";
import { AuthRoutes } from "./AuthRoutes.js";
import { AdminRoutes } from "./AdminRoutes.js";
import { StaticRoutes } from "./StaticRoutes.js";

export { type IServerConfig } from "./config.js";

export class Router {
    private authenticator?: Auth;
    private ctx!: RequestContext;
    private scoreRoutes!: ScoreRoutes;
    private authRoutes!: AuthRoutes;
    private adminRoutes!: AdminRoutes;
    private staticRoutes!: StaticRoutes;

    public constructor(private readonly config: IServerConfig) {
    }

    public get auth(): Auth {
        return this.authenticator!;
    }

    public set auth(authenticator: Auth) {
        this.authenticator = authenticator;
        this.ctx = new RequestContext(authenticator, this.config);
        this.scoreRoutes = new ScoreRoutes(this.ctx);
        this.authRoutes = new AuthRoutes(this.ctx);
        this.adminRoutes = new AdminRoutes(this.ctx);
        this.staticRoutes = new StaticRoutes(this.ctx);
    }

    public async handleRequest(req: IncomingMessage, res: ServerResponse) {
        this.setCorsHeaders(req, res);

        if (req.method === "OPTIONS") {
            res.writeHead(204);

            res.end();

            return;
        }

        const url = this.ctx.getRequestUrl(req);
        const pathname = url.pathname;
        const action = url.searchParams.get("action");

        // Sound library static files.
        if (pathname.startsWith("/soundLib/")) {
            this.staticRoutes.serveSoundLibFile(req, res);

            return;
        }

        // API routes.
        if (pathname === "/api") {
            if (!action) {
                this.ctx.sendError(res, "Missing action");

                return;
            }

            try {
                switch (action) {
                    case "health":
                        await this.handleHealth(req, res);

                        break;

                    case "setup":
                        await this.handleSetup(req, res);

                        break;

                    case "testConnection":
                        await this.handleTestConnection(req, res);

                        break;

                    case "listScoreFolderContent":
                        await this.scoreRoutes.handleListScoreFolderContent(req, res);

                        break;

                    case "getScore":
                        await this.scoreRoutes.handleGetScore(req, res);

                        break;

                    case "resetChildPermissions":
                        await this.scoreRoutes.handleResetChildPermissions(req, res);

                        break;

                    case "addScoreFolder":
                        await this.scoreRoutes.handleAddScoreFolder(req, res);

                        break;

                    case "addScore":
                        await this.scoreRoutes.handleAddScore(req, res);

                        break;

                    case "renameEntry":
                        await this.scoreRoutes.handleRenameEntry(req, res);

                        break;

                    case "updateScore":
                        await this.scoreRoutes.handleUpdateScore(req, res);

                        break;

                    case "delete":
                        await this.scoreRoutes.handleDelete(req, res);

                        break;

                    case "move":
                        await this.scoreRoutes.handleMove(req, res);

                        break;

                    case "listSoundLib":
                        this.staticRoutes.handleListSoundLib(req, res);

                        break;

                    case "clearAll":
                        await this.scoreRoutes.handleClearAll(req, res);

                        break;

                    case "login":
                        await this.authRoutes.handleLogin(req, res);

                        break;

                    case "groupLogin":
                        await this.authRoutes.handleGroupLogin(req, res);

                        break;

                    case "listPublicGroups":
                        await this.adminRoutes.handleListPublicGroups(req, res);

                        break;

                    case "refresh":
                        await this.authRoutes.handleRefresh(req, res);

                        break;

                    case "logout":
                        await this.authRoutes.handleLogout(req, res);

                        break;

                    case "whoami":
                        await this.authRoutes.handleWhoAmI(req, res);

                        break;

                    case "createInitialAdmin":
                        await this.authRoutes.handleCreateInitialAdmin(req, res);

                        break;

                    case "listUsers":
                        await this.adminRoutes.handleListUsers(req, res);

                        break;

                    case "createUser":
                        await this.adminRoutes.handleCreateUser(req, res);

                        break;

                    case "updateUser":
                        await this.adminRoutes.handleUpdateUser(req, res);

                        break;

                    case "deleteUser":
                        await this.adminRoutes.handleDeleteUser(req, res);

                        break;

                    case "listGroups":
                        await this.adminRoutes.handleListGroups(req, res);

                        break;

                    case "createGroup":
                        await this.adminRoutes.handleCreateGroup(req, res);

                        break;

                    case "updateGroup":
                        await this.adminRoutes.handleUpdateGroup(req, res);

                        break;

                    case "deleteGroup":
                        await this.adminRoutes.handleDeleteGroup(req, res);

                        break;

                    case "addUserToGroup":
                        await this.adminRoutes.handleAddUserToGroup(req, res);

                        break;

                    case "removeUserFromGroup":
                        await this.adminRoutes.handleRemoveUserFromGroup(req, res);

                        break;

                    case "listGroupMembers":
                        await this.adminRoutes.handleListGroupMembers(req, res);

                        break;

                    case "getPermissions":
                        await this.adminRoutes.handleGetPermissions(req, res);

                        break;

                    case "setPermissions":
                        await this.adminRoutes.handleSetPermissions(req, res);

                        break;

                    default:
                        this.ctx.sendError(res, "Unknown action");
                }
            } catch (e) {
                console.error("API error:", convertErrorToString(e));
                this.ctx.sendError(res, "Internal server error.", 500);
            }

            return;
        }

        // Upload instrument image.
        if (pathname === "/upload-instrument-image.php" && req.method === "POST") {
            await this.staticRoutes.handleUploadInstrumentImage(req, res);

            return;
        }

        // Serve static frontend files (dist/) with SPA fallback.
        this.staticRoutes.serveStaticFile(req, res, pathname);
    };

    /**
     * Imports seed.sql if it exists.
     *
     * @param targetAdapter The adapter to execute the seed SQL against.
     */
    public async seedIfExists(targetAdapter: IDatabaseAdapter): Promise<void> {
        const seedPath = resolve(process.cwd(), "build", "seed.sql");

        if (existsSync(seedPath)) {
            const seedSql = readFileSync(seedPath, "utf-8");

            await targetAdapter.executeMultiple(seedSql);
            console.log("Seed data imported from build/seed.sql");
        }
    };

    /**
     * Creates a database adapter based on the configured engine.
     *
     * @param engine The database engine to use. If not provided, the configured engine will be used.
     *
     * @returns An instance of a database adapter.
     */
    public createAdapter(engine?: DatabaseEngine): IDatabaseAdapter {
        switch (engine ?? this.config.database.engine) {
            case DatabaseEngine.Postgres:
                return new PostgresAdapter();

            case DatabaseEngine.MySQL:
            case DatabaseEngine.MariaDB:
            default:
                return new MySqlAdapter();
        }
    };

    /**
     * Seeds a system anonymous user. This user cannot log in — it exists only
     * as a permission reference for world-accessible entities.
     *
     * @param targetAdapter The database adapter.
     */
    public async seedAnonymousUser(targetAdapter: IDatabaseAdapter): Promise<void> {
        const rows = await targetAdapter.query<{ cnt: number; }>(
            "SELECT COUNT(*) AS cnt FROM users WHERE username = 'anonymous'",
        );

        if ((rows[0]?.cnt ?? 0) > 0) {
            return;
        }

        // Use a random 64-byte password that no one can ever log in with.
        const randomPassword = randomBytes(64).toString("hex");
        const passwordHash = await Auth.hashPassword(randomPassword);

        await targetAdapter.insertReturningId(
            `INSERT INTO users (username, password_hash, display_name)
         VALUES (?, ?, ?)`,
            ["anonymous", passwordHash, "Anonymous"],
        );

        console.log("Seeded anonymous system user.");
    };

    private async handleHealth(req: IncomingMessage, res: ServerResponse) {
        // Auth may not be injected yet during early startup.
        if (!this.authenticator) {
            this.ctx.sendJson(res, {
                status: "ok",
                configLoaded: true,
                initialized: false,
                engine: this.config.database.engine,
                host: this.config.database.host,
                port: this.config.database.port,
                database: this.config.database.database,
                hasData: false,
                hasUsers: false,
            });

            return;
        }

        let hasData = false;
        let anyUsers = false;
        let dbError: string | undefined;

        if (this.auth.adapter.isInitialized()) {
            const dbVersion = await this.auth.adapter.getSchemaVersion();

            if (dbVersion === 0) {
                dbError = "Database schema is from an older version without version tracking. "
                    + "A reset is required.";
            } else if (dbVersion < schemaVersion) {
                dbError = `Database schema is version ${dbVersion}, `
                    + `but version ${schemaVersion} is required. Use Reset Database to upgrade.`;
            }

            // Always query actual data counts so the frontend can show the correct confirmation dialog.
            try {
                const rows = await this.auth.adapter.query<{ cnt: number; }>(
                    "SELECT COUNT(*) AS cnt FROM folders",
                );

                hasData = (rows[0]?.cnt ?? 0) > 0;
                anyUsers = await this.auth.hasUsers();
            } catch (e) {
                dbError = `Schema check failed: ${convertErrorToString(e)}`;
            }
        }

        this.ctx.sendJson(res, {
            status: "ok",
            configLoaded: true,
            initialized: this.auth.adapter.isInitialized(),
            engine: this.config.database.engine,
            host: this.config.database.host,
            port: this.config.database.port,
            database: this.config.database.database,
            hasData,
            hasUsers: anyUsers,
            dbError,
        });
    };

    private async handleSetup(req: IncomingMessage, res: ServerResponse) {
        const body = await this.ctx.readJsonBody(req);

        // If the backend is already set up, only admins may reconfigure.
        // If hasUsers() fails the schema is truly broken — allow emergency reset without auth.
        if (this.auth.adapter.isInitialized()) {
            try {
                const usersExist = await this.auth.hasUsers();

                if (usersExist) {
                    const user = this.ctx.getAuthUser(req);

                    if (!user || !(await this.auth.isUserInAdminGroup(user.userId))) {
                        this.ctx.sendError(res, "Forbidden", 403);

                        return;
                    }
                }
            } catch {
                // hasUsers failed — schema is incompatible, allow emergency reset.
            }
        }

        // Merge incoming config with defaults.
        this.config.database = {
            engine: typeof body.engine === "string"
                ? body.engine as DatabaseEngine : this.config.database.engine,
            host: typeof body.host === "string" ? body.host : this.config.database.host,
            port: typeof body.port === "number" ? body.port : this.config.database.port,
            database: typeof body.database === "string" ? body.database : this.config.database.database,
            user: typeof body.user === "string" ? body.user : this.config.database.user,
            password: typeof body.password === "string" ? body.password : this.config.database.password,
        };

        // Re-create the adapter if engine changed.
        const newAdapter = this.createAdapter();

        try {
            const result = await newAdapter.testConnection(this.config.database);

            if (!result.success) {
                this.ctx.sendError(res, "Connection test failed. Check your credentials.", 400);

                return;
            }

            // If overwrite is requested, drop existing tables first.
            if (body.overwrite) {
                try {
                    await newAdapter.initialize(this.config.database);
                    await newAdapter.execute("DROP TABLE IF EXISTS entity_groups");
                    await newAdapter.execute("DROP TABLE IF EXISTS permissions");
                    await newAdapter.execute("DROP TABLE IF EXISTS user_groups");
                    await newAdapter.execute("DROP TABLE IF EXISTS login_audit");
                    await newAdapter.execute("DROP TABLE IF EXISTS `groups`");
                    await newAdapter.execute("DROP TABLE IF EXISTS users");
                    await newAdapter.execute("DROP TABLE IF EXISTS instrument_images");
                    await newAdapter.execute("DROP TABLE IF EXISTS instruments");
                    await newAdapter.execute("DROP TABLE IF EXISTS scores");
                    await newAdapter.execute("DROP TABLE IF EXISTS folders");
                    await newAdapter.execute("DROP TABLE IF EXISTS features");
                    await newAdapter.execute("DROP TABLE IF EXISTS schema_version");
                    await newAdapter.shutdown();
                    const freshAdapter = this.createAdapter();

                    await freshAdapter.initialize(this.config.database);
                    await this.seedIfExists(freshAdapter);
                    await this.seedAnonymousUser(freshAdapter);
                    await this.auth.adapter.shutdown();
                    this.auth.adapter = freshAdapter;
                    this.ctx.sendJson(res, { success: true });
                } catch (e) {
                    console.error("Overwrite failed:", convertErrorToString(e));
                    this.ctx.sendError(
                        res, "Database overwrite failed. Check server logs for details.", 500,
                    );
                }

                return;
            }

            await newAdapter.initialize(this.config.database);

            // Only load seed if tables are empty.
            const existing = await newAdapter.query<{ cnt: number; }>(
                "SELECT COUNT(*) AS cnt FROM folders",
            );

            if ((existing[0]?.cnt ?? 0) === 0) {
                await this.seedIfExists(newAdapter);
            }

            await this.seedAnonymousUser(newAdapter);
        } catch (e) {
            console.error("Database initialisation failed:", convertErrorToString(e));
            this.ctx.sendError(
                res, "Database initialisation failed. Check server logs for details.", 500,
            );

            return;
        }

        // Shutdown old adapter, activate new one.
        await this.auth.adapter.shutdown();
        this.auth.adapter = newAdapter;

        if (body.soundLibPath) {
            this.config.soundLibPath = body.soundLibPath as string;
        }

        console.log("Database setup complete.");
        this.ctx.sendJson(res, { success: true });
    };

    private async handleTestConnection(req: IncomingMessage, res: ServerResponse) {
        const user = this.ctx.getAuthUser(req);

        // During bootstrap the adapter is not yet initialized — allow unrestricted.
        if (this.auth.adapter.isInitialized()) {
            const usersExist = await this.auth.hasUsers();

            if (usersExist && (!user || !(await this.auth.isUserInAdminGroup(user.userId)))) {
                this.ctx.sendError(res, "Forbidden", 403);

                return;
            }
        }

        const body = await this.ctx.readJsonBody(req);

        const testConfig: IDatabaseConfig = {
            engine: typeof body.engine === "string" ? body.engine as DatabaseEngine : DatabaseEngine.MySQL,
            host: typeof body.host === "string" ? body.host : "127.0.0.1",
            port: typeof body.port === "number" ? body.port : 3306,
            database: typeof body.database === "string" ? body.database : "",
            user: typeof body.user === "string" ? body.user : "root",
            password: typeof body.password === "string" ? body.password : "",
        };

        const testAdapter = this.createAdapter(testConfig.engine);

        try {
            const result = await testAdapter.testConnection(testConfig);

            await testAdapter.shutdown();

            if (result.success) {
                this.ctx.sendJson(res, { success: true });
            } else {
                this.ctx.sendJson(res, { success: false, error: result.error ?? "Connection failed." });
            }
        } catch (e: unknown) {
            console.error("testConnection error:", convertErrorToString(e));
            this.ctx.sendJson(res, { success: false, error: String(e) });
        }
    };

    /**
     * Sets CORS headers based on the request origin and the configured allowlist.
     * When no allowedOrigins are configured, sends no CORS headers (strictest default).
     *
     * @param req The incoming HTTP request.
     * @param res The HTTP response.
     */
    private setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
        const allowed = this.config.allowedOrigins;

        if (!allowed || allowed.length === 0) {
            return;
        }

        const origin = this.ctx.getHeader(req, "origin");

        if (!origin) {
            return;
        }

        if (!allowed.includes(origin)) {
            return;
        }

        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    };
}
