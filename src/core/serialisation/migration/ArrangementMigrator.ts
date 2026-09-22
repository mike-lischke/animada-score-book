/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Arrangement } from "../../Arrangement.js";
import type { ISbDmInstrument } from "../../ScoreBookDataModel.js";
import { TimeParams } from "../../TimeParams.js";
import type { IArrangementSnapshot } from "../../types/general.js";
import { unpackArrangementSnapshot, type IPackedArrangement } from "../snapshot-packing.js";
import { arrangementSnapshotVersion, isNaturalNumber } from "../snapshots.js";
import { BananaDrumMigrator, type IBananaDrumSnapshot } from "./BananaDrumMigrator.js";

/** Returned by {@link ArrangementMigrator.migrateToArrangement}. */
export interface IMigrationResult {
    /** The arrangement at the current schema version. */
    arrangement: Arrangement;
    /** Whether a schema migration was performed. */
    migrated: boolean;
}

/**
 * The single entry point for loading arrangements. Two kinds of input exist: content in the current
 * snapshot schema, and BananaDrum share links, the only format that predates it. Everything older than
 * the current schema is a share link, which is why there is exactly one migration.
 */
export class ArrangementMigrator {
    /**
     * Migrates any supported input format to a live {@link Arrangement} at the current schema version.
     *
     * @param source An arrangement snapshot, a BananaDrum share link, or raw score content.
     * @param instruments The available instruments.
     *
     * @returns The migrated arrangement together with a flag indicating whether a schema migration was performed.
     */
    public static migrateToArrangement(source: IArrangementSnapshot | IBananaDrumSnapshot | URLSearchParams | string,
        instruments: ISbDmInstrument[]): IMigrationResult {
        if (typeof source === "string") {
            const packed = ArrangementMigrator.tryParsePackedSource(source);

            if (packed) {
                if (packed.v !== arrangementSnapshotVersion) {
                    throw new Error(`Unsupported snapshot schema version: ${packed.v}`);
                }

                return {
                    arrangement: this.createArrangementFromSnapshot(unpackArrangementSnapshot(packed), instruments),
                    migrated: false,
                };
            }

            // What remains is a share link — either a full URL or a bare query string, and either way no
            // score content. new URLSearchParams(fullUrl) behaviour varies across runtimes, so cut the URL first.
            const query = source.startsWith("http")
                ? new URL(source).search
                : source;

            return this.migrateShareLink(new URLSearchParams(query), instruments, "Score content could not be decoded");
        }

        if (source instanceof URLSearchParams) {
            return this.migrateShareLink(source, instruments, "URL does not contain a recognised score payload");
        }

        if (BananaDrumMigrator.isShareLinkSnapshot(source)) {
            return {
                arrangement: this.createArrangementFromSnapshot(
                    BananaDrumMigrator.toSnapshot(source, instruments), instruments,
                ),
                migrated: true,
            };
        }

        if (source.version !== arrangementSnapshotVersion) {
            throw new Error(`Unsupported snapshot schema version: ${source.version}`);
        }

        return { arrangement: this.createArrangementFromSnapshot(source, instruments), migrated: false };
    }

    /**
     * Migrates a BananaDrum share link into a live arrangement.
     *
     * @param params The search params of the share link.
     * @param instruments The available instruments.
     * @param failure The message for a source that holds no share-link payload, which differs between
     *                quoting a link and loading score content.
     *
     * @returns The migrated arrangement.
     */
    private static migrateShareLink(params: URLSearchParams, instruments: ISbDmInstrument[],
        failure: string): IMigrationResult {
        const decoded = BananaDrumMigrator.decodeShareLink(params, instruments);
        if (!decoded) {
            throw new Error(failure);
        }

        return {
            arrangement: this.createArrangementFromSnapshot(
                BananaDrumMigrator.toSnapshot(decoded, instruments), instruments,
            ),
            migrated: true,
        };
    }

    private static createArrangementFromSnapshot(snapshot: IArrangementSnapshot,
        instruments: ISbDmInstrument[]): Arrangement {
        const tps = snapshot.timeParams;
        const timeParams = new TimeParams(
            tps.timeSignature, tps.tempo, tps.length, tps.pulse, tps.stepResolution,
        );

        const arrangement = new Arrangement();
        arrangement.timeParams = timeParams;
        arrangement.applyArrangementSnapshot(snapshot, instruments);

        return arrangement;
    }

    private static tryParsePackedSource(content: string): IPackedArrangement | undefined {
        const trimmed = content.trimStart();
        if (!trimmed.startsWith("{")) {
            return undefined;
        }

        try {
            const parsed = JSON.parse(trimmed) as unknown;
            if (typeof parsed !== "object" || parsed === null) {
                return undefined;
            }

            const candidate = parsed as { v?: unknown; p?: unknown; k?: unknown; };
            if (!isNaturalNumber(candidate.v) || !Array.isArray(candidate.p) || !Array.isArray(candidate.k)) {
                return undefined;
            }

            return parsed as IPackedArrangement;
        } catch {
            return undefined;
        }
    }
}
