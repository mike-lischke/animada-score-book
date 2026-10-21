/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { MeasureLayout } from "../../src/core/MeasureLayout.js";
import type { INotationGrid } from "../../src/core/MeasureProjection.js";
import { PageOrientation, PrintLayout } from "../../src/core/PrintLayout.js";
import type { ISbDmArrangement, ISbDmTrack } from "../../src/core/ScoreBookDataModel.js";
import { TrackViewMode } from "../../src/core/types/general.js";
import {
    PrintSession, defaultPrintMargins, defaultPrintScale, maxPreviewZoom, maxPrintMargin, maxPrintScale,
    minPreviewZoom, minPrintMargin, minPrintScale,
} from "../../src/ui/PrintSession.js";

/** A 4/4 grid, which is all the notation rules the width floor needs. */
const grid: INotationGrid = { stepsPerBar: 16, beatGroups: [4, 4, 4, 4] };

/**
 * @param id The track id.
 * @param barCount The number of measures the track holds.
 *
 * @returns A track whose measures each hold one whole-bar rest.
 */
const restTrack = (id: number, barCount: number): ISbDmTrack => {
    const measure = {
        events: [{ start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 1 } }],
        subdivisions: [],
        meter: { stepResolution: 16 },
        noteEvents: [],
    };

    return {
        id,
        instrument: { noteStyles: {} },
        measures: Array.from({ length: barCount }, () => {
            return { ...measure };
        }),
    } as unknown as ISbDmTrack;
};

/**
 * @param id The runtime id of the arrangement.
 * @param trackIds The ids of its tracks.
 * @param barCount The number of measures every track holds.
 *
 * @returns An arrangement of one-measure tracks.
 */
const arrangementOf = (id: number, trackIds: number[], barCount = 2): ISbDmArrangement => {
    return {
        id,
        tracks: trackIds.map((trackId) => {
            return restTrack(trackId, barCount);
        }),
        measureWidths: new Map(),
    } as unknown as ISbDmArrangement;
};

describe("PrintSession", () => {
    it("starts with A4 portrait, the default margins and print scale, and no preview magnification", () => {
        const session = new PrintSession();

        expect(session.pageSetup).toEqual({
            orientation: PageOrientation.Portrait,
            margins: { ...defaultPrintMargins },
            printScale: defaultPrintScale,
        });
        expect(session.previewZoom).toBe(1);
    });

    it("hands out a copy of its page settings", () => {
        const session = new PrintSession();

        session.pageSetup.margins.top = 40;

        expect(session.pageSetup.margins.top).toBe(defaultPrintMargins.top);
    });

    it("keeps the page settings over an arrangement change", () => {
        const session = new PrintSession();
        session.setOrientation(PageOrientation.Landscape);
        session.setPrintScale(0.7);

        const arrangement = arrangementOf(1, [1]);

        expect(session.pageSetup.orientation).toBe(PageOrientation.Landscape);
        expect(session.pageSetup.printScale).toBe(0.7);
        expect(session.selectedTrackIds(arrangement)).toBeUndefined();
    });

    it("clamps the print scale and the preview zoom to their supported ranges", () => {
        const session = new PrintSession();

        session.setPrintScale(100);
        expect(session.pageSetup.printScale).toBe(maxPrintScale);

        session.setPrintScale(-1);
        expect(session.pageSetup.printScale).toBe(minPrintScale);

        session.setPreviewZoom(0);
        expect(session.previewZoom).toBe(minPreviewZoom);

        session.setPreviewZoom(99);
        expect(session.previewZoom).toBe(maxPreviewZoom);
    });

    it("clamps the margins to the supported range", () => {
        const session = new PrintSession();

        session.setMargins({ top: -20, right: 60, bottom: 3, left: 4 });

        expect(session.pageSetup.margins)
            .toEqual({ top: minPrintMargin, right: maxPrintMargin, bottom: 3, left: 4 });
    });

    it("starts with every track selected and refuses to deselect the last one", () => {
        const session = new PrintSession();
        const arrangement = arrangementOf(1, [1, 2]);

        expect(session.selectedTrackIds(arrangement)).toBeUndefined();
        expect(session.isTrackSelected(arrangement, 2)).toBe(true);

        expect(session.setTrackSelected(arrangement, 2, false)).toBe(true);
        expect(Array.from(session.selectedTrackIds(arrangement) ?? [])).toEqual([1]);
        expect(session.isTrackSelected(arrangement, 2)).toBe(false);

        expect(session.setTrackSelected(arrangement, 1, false)).toBe(false);
        expect(Array.from(session.selectedTrackIds(arrangement) ?? [])).toEqual([1]);
    });

    it("falls back to selecting every track once all of them are selected again", () => {
        const session = new PrintSession();
        const arrangement = arrangementOf(1, [1, 2]);

        session.setTrackSelected(arrangement, 1, false);
        session.setTrackSelected(arrangement, 1, true);

        expect(session.selectedTrackIds(arrangement)).toBeUndefined();
    });

    it("selects every track again after a partial selection", () => {
        const session = new PrintSession();
        const arrangement = arrangementOf(1, [1, 2]);

        session.setTrackSelected(arrangement, 1, false);
        session.selectAllTracks(arrangement);

        expect(session.selectedTrackIds(arrangement)).toBeUndefined();
        expect(session.isTrackSelected(arrangement, 1)).toBe(true);
    });

    it("keeps temporary print widths and raises them to what the measure's notation needs", () => {
        const session = new PrintSession();
        const arrangement = arrangementOf(1, [1]);
        const minimum = MeasureLayout.contentMinimumWidthOfMeasure(arrangement, 1);

        session.setWidthOverride(arrangement, 1, 10);
        session.setWidthOverride(arrangement, 2, 900);

        expect(session.widthOverrides(arrangement).get(1)).toBe(minimum);
        expect(minimum).toBeGreaterThan(10);
        expect(session.widthOverrides(arrangement).get(2)).toBe(900);
    });

    it("resets one or all temporary print widths", () => {
        const session = new PrintSession();
        const arrangement = arrangementOf(1, [1]);

        session.setWidthOverride(arrangement, 1, 900);
        session.setWidthOverride(arrangement, 2, 950);

        session.resetWidthOverride(arrangement, 1);
        expect(session.widthOverrides(arrangement).has(1)).toBe(false);
        expect(session.widthOverrides(arrangement).get(2)).toBe(950);

        session.resetWidthOverrides(arrangement);
        expect(session.widthOverrides(arrangement).size).toBe(0);
    });

    it("never writes its temporary widths into the arrangement", () => {
        const session = new PrintSession();
        const arrangement = arrangementOf(1, [1]);

        session.setWidthOverride(arrangement, 1, 2000);

        expect(arrangement.measureWidths?.size).toBe(0);
    });

    it("keeps the state of two arrangements apart", () => {
        const session = new PrintSession();
        const first = arrangementOf(1, [1, 2]);
        const second = arrangementOf(2, [1, 2]);

        session.setTrackSelected(first, 1, false);
        session.setWidthOverride(first, 1, 900);

        expect(session.isTrackSelected(second, 1)).toBe(true);
        expect(session.selectedTrackIds(second)).toBeUndefined();
        expect(session.widthOverrides(second).size).toBe(0);
        expect(session.widthOverrides(first).get(1)).toBe(900);
    });

    it("drops only the state of the arrangement it resets", () => {
        const session = new PrintSession();
        const first = arrangementOf(1, [1, 2]);
        const second = arrangementOf(2, [1, 2]);

        session.setTrackSelected(first, 1, false);
        session.setWidthOverride(first, 1, 900);
        session.setWidthOverride(second, 1, 950);

        session.resetArrangement(first);

        expect(session.selectedTrackIds(first)).toBeUndefined();
        expect(session.widthOverrides(first).size).toBe(0);
        expect(session.widthOverrides(second).get(1)).toBe(950);
    });

    it("forgets the state of an arrangement by its id", () => {
        const session = new PrintSession();
        const arrangement = arrangementOf(7, [1]);

        session.setWidthOverride(arrangement, 1, 900);
        session.forgetArrangement(7);

        expect(session.widthOverrides(arrangement).size).toBe(0);
    });

    it("changes neither the page setup nor the layout when the preview zoom changes", () => {
        const session = new PrintSession();
        const arrangement = arrangementOf(1, [1], 3);
        const layoutOf = () => {
            return PrintLayout.layout({
                arrangement,
                barCount: 3,
                grid,
                setup: session.pageSetup,
                tracks: arrangement.tracks,
                viewMode: TrackViewMode.Staff,
            });
        };

        const before = layoutOf();
        const setupBefore = session.pageSetup;

        session.setPreviewZoom(2.5);

        expect(session.pageSetup).toEqual(setupBefore);
        expect(layoutOf()).toEqual(before);
    });
});
