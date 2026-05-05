/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it, vi } from "vitest";

import { BananaDrumUrlImporter } from "../../src/core/serialisation/BananaDrumUrlImporter.js";
import { SbDmEntityType, type ISbDmInstrument } from "../../src/core/ScoreBookDataModel.js";

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

describe("BananaDrumUrlImporter versioning", () => {
    const instruments = [
        createInstrument("0", 0, 0),
        createInstrument("1", 1, 1),
        createInstrument("2", 2, 2),
        createInstrument("3", 3, 3),
        createInstrument("5", 5, 5),
        createInstrument("6", 6, 6),
        createInstrument("7", 7, 7),
        createInstrument("8", 8, 8),
        createInstrument("9", 9, 9),
    ];

    it("uses v when present for a links", () => {
        const params = new URLSearchParams(
            "v=4&t=Demo&a=4-4.110.1.1-4.16.00.10.20.30.50.60.70.80.90"
        );

        const snapshot = BananaDrumUrlImporter.getArrangementSnapshotFromParams(params, instruments)!;
        expect(snapshot.version).toEqual(1);
    });

    it("falls back to inferred legacy version when v is missing", () => {
        const params = new URLSearchParams(
            "t=Demo&a2=4-4.110.1.1-4.16.00.10.20.30.50.60.70.80.90"
        );

        const snapshot = BananaDrumUrlImporter.getArrangementSnapshotFromParams(params, instruments)!;
        expect(snapshot.version).toEqual(1);
    });

    it("falls back to 1 when v is invalid", () => {
        const params = new URLSearchParams(
            "v=0&t=Demo&a=4-4.110.1.1-4.16.00.10.20.30.50.60.70.80.90"
        );

        const snapshot = BananaDrumUrlImporter.getArrangementSnapshotFromParams(params, instruments)!;
        expect(snapshot.version).toEqual(1);
    });

    it("preserves imported titles verbatim", () => {
        const params = new URLSearchParams(
            "t=Beija%20Flor%202004%20%20-%20%20Bossa%201%20(H-Break)&a2=4-4.110.1.1-4.16.00.10.20.30.50.60.70.80.90"
        );

        const snapshot = BananaDrumUrlImporter.getArrangementSnapshotFromParams(params, instruments)!;
        expect(snapshot.title).toEqual("Beija Flor 2004  -  Bossa 1 (H-Break)");
    });
});
