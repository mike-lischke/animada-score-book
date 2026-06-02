/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { bateriaInstruments } from "../../../../src/bateria-instruments.js";
import { BananaDrumUrlImporter } from "../../../../src/core/serialisation/migration/BananaDrumUrlImporter.js";
import { MockInstrument } from "../../mocks/MockInstrument.js";

const instruments = bateriaInstruments.map((meta) => {
    return new MockInstrument(meta);
});

describe("BananaDrumUrlImporter versioning", () => {

    it("uses v when present for a links", () => {
        const params = new URLSearchParams(
            "v=4&t=Demo&a=4-4.110.1.1-4.16.00.10.20.30.50.60.70.80.90"
        );

        const arrangement = BananaDrumUrlImporter.getArrangementFromParams(params, instruments)!;
        expect(arrangement.snapshot.version).toEqual(1);
    });

    it("falls back to inferred legacy version when v is missing", () => {
        const params = new URLSearchParams(
            "t=Demo&a2=4-4.110.1.1-4.16.00.10.20.30.50.60.70.80.90"
        );

        const arrangement = BananaDrumUrlImporter.getArrangementFromParams(params, instruments)!;
        expect(arrangement.snapshot.version).toEqual(1);
    });

    it("falls back to 1 when v is invalid", () => {
        const params = new URLSearchParams(
            "v=0&t=Demo&a=4-4.110.1.1-4.16.00.10.20.30.50.60.70.80.90"
        );

        const arrangement = BananaDrumUrlImporter.getArrangementFromParams(params, instruments)!;
        expect(arrangement.snapshot.version).toEqual(1);
    });

    it("preserves imported titles verbatim", () => {
        const params = new URLSearchParams(
            "t=Beija%20Flor%202004%20%20-%20%20Bossa%201%20(H-Break)&a2=4-4.110.1.1-4.16.00.10.20.30.50.60.70.80.90"
        );

        const arrangement = BananaDrumUrlImporter.getArrangementFromParams(params, instruments)!;
        expect(arrangement.title).toEqual("Beija Flor 2004  -  Bossa 1 (H-Break)");
    });

    it("creates correct Bolero 3 legacy arrangement", () => {
        const params = new URLSearchParams(
            "t=Bolero%203&a2=6-8.50.1.3-8.8.319ihbrp-4UX1WbY5oS"
        );

        const la = BananaDrumUrlImporter.getArrangementFromParams(params, instruments)!;
        expect(la.title).toBe("Bolero 3");
        expect(la.timeParams.timeSignature).toBe("6/8");
        expect(la.timeParams.tempo).toBe(50);
        expect(la.timeParams.length).toBe(1);
        expect(la.timeParams.stepResolution).toBe(8);

        expect(la.tracks).toHaveLength(1);
        const track = la.tracks[0];
        expect(track.instrumentId).toBe("3");
        // Grid notes: stepsPerBar=6, 1 bar → 6
        expect(track.notes).toHaveLength(6);
        // Snapshot notes (grid + polyrhythm): 13
        expect(la.snapshot.tracks[0].notes).toHaveLength(13);
        expect(track.polyrhythms).toHaveLength(3);
        expect(track.polyrhythms[0].length).toBe(3);
        expect(track.polyrhythms[1].length).toBe(3);
        expect(track.polyrhythms[2].length).toBe(4);
    });

    it("creates correct Repi Solo legacy arrangement", () => {
        /* cspell:disable */
        const params = new URLSearchParams(
            "t=Repi%20Solo%20Gabriel%20Policarpo%20(3%20extra%20Schl%C3%A4ge)" +
            "&a2=4-4.120.13.1-4.16.3w0w0w0w0YD9YD9U0ENPU88v089YD11YD89YD11U0br331Prr1roooero08o1308oee88o11308o" +
            "3108o30oYDAU8o1308oee88o11308o80-2OewGGYWgHHzHhoG0U.3MMM00600MMM00066MMS660666MMMS66MMS06MS0000066MMS" +
            "660066M0000000.8g__LH32dfi3a0W~J6nInt4qwCvXtcPbR0LgWAHCzXe~DzXNWT5bQGt~.9drFHcHu~CY5FUQX1GaQs0S3A1~n" +
            "hyCTb4ybOeMH73m6PPjB4En3PUu"
        );
        /* cspell:enable */

        const la = BananaDrumUrlImporter.getArrangementFromParams(params, instruments)!;
        expect(la.timeParams.timeSignature).toBe("4/4");
        expect(la.timeParams.tempo).toBe(120);
        expect(la.timeParams.length).toBe(13);
        expect(la.timeParams.stepResolution).toBe(16);

        expect(la.tracks).toHaveLength(4);

        // Grid notes: 16 stepsPerBar * 13 bars = 208
        // Track 0: instrument "3", snapshot has 214 notes (208 grid + 6 poly)
        expect(la.tracks[0].instrumentId).toBe("3");
        expect(la.tracks[0].notes).toHaveLength(208);
        expect(la.snapshot.tracks[0].notes).toHaveLength(214);
        expect(la.tracks[0].polyrhythms).toHaveLength(4);

        // Track 1: instrument "3", 208 grid notes, no polyrhythms
        expect(la.tracks[1].instrumentId).toBe("3");
        expect(la.tracks[1].notes).toHaveLength(208);
        expect(la.tracks[1].polyrhythms).toHaveLength(0);

        // Track 2: instrument "8", 208 grid notes, no polyrhythms
        expect(la.tracks[2].instrumentId).toBe("8");
        expect(la.tracks[2].notes).toHaveLength(208);

        // Track 3: instrument "9", 208 grid notes, no polyrhythms
        expect(la.tracks[3].instrumentId).toBe("9");
        expect(la.tracks[3].notes).toHaveLength(208);
    });

});
