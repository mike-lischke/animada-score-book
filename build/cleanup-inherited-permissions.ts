/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * Removes explicit permissions for scores and folders that are nested inside
 * a parent folder, so they inherit permissions from their parent instead.
 * Only root-level entities keep their own permissions row.
 *
 * Run via:
 *   npx tsx build/cleanup-inherited-permissions.ts
 */

import { createConnection } from "mysql2/promise";

import backendConfig from "../backend-config.json" assert { type: "json" };

const cleanup = async (): Promise<void> => {
    const connection = await createConnection({
        host: backendConfig.database.host,
        port: backendConfig.database.port,
        user: backendConfig.database.user,
        password: backendConfig.database.password,
        database: backendConfig.database.database,
    });

    console.log("Connected to database.");

    const sqlDeleteScores =
        "DELETE p FROM permissions p " +
        "INNER JOIN scores s ON p.entity_id = s.id AND p.entity_type = 'score' " +
        "WHERE s.folderid IS NOT NULL";

    const [scoreResult] = await connection.execute(sqlDeleteScores);
    console.log("Removed " + (scoreResult as { affectedRows: number; }).affectedRows + " score permission rows.");

    const sqlDeleteFolders =
        "DELETE p FROM permissions p " +
        "INNER JOIN folders f ON p.entity_id = f.id AND p.entity_type = 'folder' " +
        "WHERE f.parentid IS NOT NULL";

    const [folderResult] = await connection.execute(sqlDeleteFolders);
    console.log("Removed " + (folderResult as { affectedRows: number; }).affectedRows + " folder permission rows.");

    await connection.end();
    console.log("Done.");
};

void cleanup();
