/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { bateriaInstruments } from "../../src/bateria-instruments.js";
import type { InstrumentRole } from "../../src/core/ScoreBookDataModel.js";
import { TagPalette } from "../../src/core/TagPalette.js";

/** One system tag of the baseline. */
interface IBaselineTag {
    name: string;
    colorIndex: number;
    systemKey: string;
}

/**
 * @returns The system tags the baseline inserts, in the order of the insert.
 */
const baselineTags = (): IBaselineTag[] => {
    // Vitest runs with the repository root as the working directory, like the tests that read stylesheets.
    const sql = readFileSync("migrations/00000000T000000_baseline.sql", "utf-8");
    const pattern = /^\s*\('([^']+)', (\d+), '((?:instrument|demo)[^']*)'\)/gm;

    return Array.from(sql.matchAll(pattern), (match) => {
        return { name: match[1], colorIndex: Number(match[2]), systemKey: match[3] };
    });
};

/**
 * @param typeId The instrument type id.
 *
 * @returns The role of that instrument.
 */
const roleOf = (typeId: string): InstrumentRole => {
    const instrument = bateriaInstruments.find((candidate) => {
        return candidate.typeId === typeId;
    });

    if (instrument === undefined) {
        throw new Error(`The instrument type ${typeId} is unknown.`);
    }

    if (instrument.role === undefined) {
        throw new Error(`The instrument type ${typeId} names no role.`);
    }

    return instrument.role;
};

describe("baseline system tags", () => {
    it("gives every instrument type of the catalogue a tag", () => {
        const typeIds = baselineTags().filter((tag) => {
            return tag.systemKey.startsWith("instrument:");
        }).map((tag) => {
            return tag.systemKey.slice("instrument:".length);
        });

        expect(new Set(typeIds)).toEqual(new Set(bateriaInstruments.map((instrument) => {
            return instrument.typeId;
        })));
    });

    it("wears one palette colour per instrument role", () => {
        const coloursByRole = new Map<InstrumentRole, number>();

        for (const tag of baselineTags()) {
            if (!tag.systemKey.startsWith("instrument:")) {
                continue;
            }

            const role = roleOf(tag.systemKey.slice("instrument:".length));
            const known = coloursByRole.get(role);

            if (known === undefined) {
                coloursByRole.set(role, tag.colorIndex);
            } else {
                expect(tag.colorIndex, tag.name).toBe(known);
            }
        }

        expect(coloursByRole.size).toBeGreaterThan(1);
    });

    it("names a role for every instrument type", () => {
        for (const instrument of bateriaInstruments) {
            expect(instrument.role, instrument.displayName).toBeDefined();
        }
    });

    it("uses colours the palette holds", () => {
        for (const tag of baselineTags()) {
            expect(TagPalette.isValidIndex(tag.colorIndex), tag.name).toBe(true);
        }
    });
});
