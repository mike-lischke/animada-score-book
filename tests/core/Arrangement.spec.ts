/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it, vi } from "vitest";

import { Arrangement } from "../../src/core/Arrangement.js";
import { SbDmEntityType, type ISbDmInstrument } from "../../src/core/ScoreBookDataModel.js";
import type { IArrangementSnapshot } from "../../src/core/types/general.js";

const createInstrument = (typeId: string, id: number, displayOrder: number): ISbDmInstrument => {
    return {
        type: SbDmEntityType.Instrument,
        id,
        typeId,
        displayOrder,
        displayName: `Instrument ${typeId}`,
        image: { type: SbDmEntityType.InstrumentImage, id: id + 1000, filePath: "" },
        color: "",
        range: [0, 0],
        state: {
            initialized: true,
            isLeaf: true,
            expanded: false,
            expandedOnce: false,
        },
        noteStyles: {},
        subscribe: vi.fn(() => {
            return undefined;
        }),
        unsubscribe: vi.fn(() => {
            return undefined;
        }),
        publish: vi.fn(() => {
            return undefined;
        }),
    };
};

describe("Arrangement", () => {
    it("removes all obsolete tracks when applying a snapshot", () => {
        const instruments = [
            createInstrument("0", 0, 0),
            createInstrument("1", 1, 1),
            createInstrument("2", 2, 2),
        ];

        const originalSnapshot: IArrangementSnapshot = {
            title: "Original",
            timeParams: {
                timeSignature: "4/4",
                tempo: 120,
                length: 1,
                pulse: "1/4",
                stepResolution: 4,
            },
            tracks: [
                { id: 100, instrumentId: "0", notes: [], polyrhythms: [] },
                { id: 200, instrumentId: "1", notes: [], polyrhythms: [] },
                { id: 300, instrumentId: "2", notes: [], polyrhythms: [] },
            ]
        };

        const arrangement = Arrangement.fromSnapshot(originalSnapshot, instruments);

        arrangement.applyArrangementSnapshot({
            ...originalSnapshot,
            title: "Imported",
            tracks: [],
        }, instruments);

        expect(arrangement.tracks).toHaveLength(0);
    });
});
