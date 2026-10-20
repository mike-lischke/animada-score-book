/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { MeasureLayout, staffPrefixWidth } from "../../src/core/MeasureLayout.js";
import type { INotationGrid } from "../../src/core/MeasureProjection.js";
import {
    PageOrientation, PrintLayout, PrintOverflowKind, printGridHeadRoom, printGridRowHeight,
    printInstrumentColumnWidth, printInstrumentGap, printRowGap, printStaffHeadRoom,
    type IPageMargins, type IPrintLayout, type IPrintOverflow, type IPrintPageSetup,
} from "../../src/core/PrintLayout.js";
import type { ISbDmArrangement, ISbDmTrack } from "../../src/core/ScoreBookDataModel.js";
import { StaffRowGeometry } from "../../src/core/StaffRowGeometry.js";
import { TrackViewMode } from "../../src/core/types/general.js";

/** A 4/4 grid, which is all the notation rules the row geometry calls need. */
const grid: INotationGrid = { stepsPerBar: 16, beatGroups: [4, 4, 4, 4] };

/** The margins every test uses unless it states its own. */
const standardMargins: IPageMargins = { top: 15, right: 15, bottom: 15, left: 15 };

/** CSS px per millimeter, to state an expected printed length. */
const pxPerMillimeter = 96 / 25.4;

/** Width of the name and prefix columns of a printed staff system, in layout px. */
const staffLeadingWidth = printInstrumentColumnWidth + printInstrumentGap + staffPrefixWidth;

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
 * @param id The track id.
 * @param barCount The number of measures the track holds.
 *
 * @returns A track whose measures each hold one quarter note on the staff's first line.
 */
const noteTrack = (id: number, barCount: number): ISbDmTrack => {
    const measure = {
        events: [{
            start: { numerator: 0, denominator: 1 },
            duration: { numerator: 1, denominator: 4 },
            noteStyleId: "1",
        }],
        subdivisions: [],
        meter: { stepResolution: 16 },
        noteEvents: [],
    };

    return {
        id,
        instrument: { noteStyles: { "1": { id: "1", noteLine: 1 } } },
        measures: Array.from({ length: barCount }, () => {
            return { ...measure };
        }),
    } as unknown as ISbDmTrack;
};

/**
 * @param id The runtime id of the arrangement.
 * @param tracks The tracks of the arrangement.
 *
 * @returns An arrangement of those tracks without stored measure widths.
 */
const arrangementOf = (id: number, tracks: ISbDmTrack[]): ISbDmArrangement => {
    return { id, tracks, measureWidths: new Map() } as unknown as ISbDmArrangement;
};

/**
 * @param printScale Optional print scale factor, 1 when omitted.
 * @param orientation Optional page orientation, portrait when omitted.
 *
 * @returns Page settings of the given scale and orientation with the standard margins.
 */
const setupOf = (printScale = 1, orientation = PageOrientation.Portrait): IPrintPageSetup => {
    return { orientation, margins: { ...standardMargins }, printScale };
};

interface ILayoutOptions {
    arrangement: ISbDmArrangement;
    barCount: number;
    margins?: IPageMargins;
    printScale?: number;
    viewMode?: TrackViewMode;
    widthOverrides?: ReadonlyMap<number, number>;
}

/**
 * @param options The score and page settings to lay out.
 *
 * @returns The printed layout of the arrangement's tracks.
 */
const layoutOf = (options: ILayoutOptions): IPrintLayout => {
    const { arrangement, barCount, margins = standardMargins, printScale = 1,
        viewMode = TrackViewMode.Staff, widthOverrides } = options;

    return PrintLayout.layout({
        arrangement,
        barCount,
        grid,
        setup: { orientation: PageOrientation.Portrait, margins: { ...margins }, printScale },
        tracks: arrangement.tracks,
        viewMode,
        widthOverrides,
    });
};

/**
 * @param layout The layout to inspect.
 *
 * @returns The 1-based measure numbers of every system, in page and system order.
 */
const systemBars = (layout: IPrintLayout): number[][] => {
    return layout.pages.flatMap((page) => {
        return page.systems.map((system) => {
            return system.measures.map((measure) => {
                return measure.bar;
            });
        });
    });
};

/**
 * @param layout The layout to inspect.
 * @param kind The kind of overflow to collect.
 *
 * @returns The overflows of that kind.
 */
const overflowsOf = (layout: IPrintLayout, kind: PrintOverflowKind): IPrintOverflow[] => {
    return layout.overflows.filter((overflow) => {
        return overflow.kind === kind;
    });
};

describe("PrintLayout", () => {
    describe("pageGeometry", () => {
        it("states an A4 page in printed px and keeps the header bands apart from the margins", () => {
            const geometry = PrintLayout.pageGeometry(setupOf());

            expect(geometry.widthPx).toBeCloseTo(210 * pxPerMillimeter, 5);
            expect(geometry.heightPx).toBeCloseTo(297 * pxPerMillimeter, 5);
            expect(geometry.contentWidthPx).toBeCloseTo(180 * pxPerMillimeter, 5);
            expect(geometry.contentHeightPx).toBeCloseTo(267 * pxPerMillimeter, 5);
            expect(geometry.runningHeaderHeightPx).toBe(28);
            expect(geometry.titleBlockHeightPx).toBe(60);
        });

        it("swaps the paper sides for the landscape orientation", () => {
            const geometry = PrintLayout.pageGeometry(setupOf(1, PageOrientation.Landscape));

            expect(geometry.widthPx).toBeCloseTo(297 * pxPerMillimeter, 5);
            expect(geometry.heightPx).toBeCloseTo(210 * pxPerMillimeter, 5);
            expect(geometry.contentWidthPx).toBeCloseTo(267 * pxPerMillimeter, 5);
        });

        it("uses the whole paper when the margins are zero", () => {
            const geometry = PrintLayout.pageGeometry({
                ...setupOf(),
                margins: { top: 0, right: 0, bottom: 0, left: 0 },
            });

            expect(geometry.contentWidthPx).toBeCloseTo(geometry.widthPx, 5);
            expect(geometry.contentHeightPx).toBeCloseTo(geometry.heightPx, 5);
        });

        it("keeps a content area of at least one px when the margins exceed the paper", () => {
            const geometry = PrintLayout.pageGeometry({
                ...setupOf(),
                margins: { top: 200, right: 200, bottom: 200, left: 200 },
            });

            expect(geometry.contentWidthPx).toBe(1);
            expect(geometry.contentHeightPx).toBe(1);
        });
    });

    describe("effectiveWidths", () => {
        it("uses the stored widths unchanged instead of halving them", () => {
            const arrangement = arrangementOf(1, [restTrack(1, 3)]);
            arrangement.measureWidths = new Map([[2, 900]]);

            expect(PrintLayout.effectiveWidths(arrangement, 3))
                .toEqual([MeasureLayout.defaultWidth(), 900, MeasureLayout.defaultWidth()]);
        });

        it("prefers a print override over the stored width", () => {
            const arrangement = arrangementOf(1, [restTrack(1, 3)]);
            arrangement.measureWidths = new Map([[2, 900]]);

            expect(PrintLayout.effectiveWidths(arrangement, 3, new Map([[2, 700]])))
                .toEqual([MeasureLayout.defaultWidth(), 700, MeasureLayout.defaultWidth()]);
        });

        it("raises a width to what the measure's notation needs", () => {
            const arrangement = arrangementOf(1, [restTrack(1, 2)]);
            const minimum = MeasureLayout.contentMinimumWidthOfMeasure(arrangement, 1);

            const widths = PrintLayout.effectiveWidths(arrangement, 2, new Map([[1, 10]]));

            expect(widths[0]).toBe(minimum);
            expect(minimum).toBeGreaterThan(10);
        });

        it("resolves widths for exactly the measures it is asked for", () => {
            const arrangement = arrangementOf(1, [restTrack(1, 4)]);

            expect(PrintLayout.effectiveWidths(arrangement, 2))
                .toEqual([MeasureLayout.defaultWidth(), MeasureLayout.defaultWidth()]);
        });
    });

    describe("layout", () => {
        it("packs measures into systems by their widths and leaves a partial system unstretched", () => {
            const arrangement = arrangementOf(1, [restTrack(1, 4)]);
            arrangement.measureWidths = new Map([[1, 400], [2, 300], [3, 200], [4, 100]]);

            const layout = layoutOf({ arrangement, barCount: 4 });
            const systems = layout.pages.flatMap((page) => {
                return page.systems;
            });
            const partial = systems[2];

            expect(systemBars(layout)).toEqual([[1], [2], [3, 4]]);
            expect(partial.measures.map((measure) => {
                return measure.widthPx;
            })).toEqual([200, 100]);
            expect(partial.measures.map((measure) => {
                return measure.offsetPx;
            })).toEqual([staffLeadingWidth, staffLeadingWidth + 200]);
            expect(partial.widthPx).toBe(staffLeadingWidth + 300);
        });

        it("gives a staff system the name and prefix columns and a grid system the name column only", () => {
            const arrangement = arrangementOf(1, [restTrack(1, 1)]);

            const staff = layoutOf({ arrangement, barCount: 1 }).pages[0].systems[0];
            const gridPage = layoutOf({ arrangement, barCount: 1, viewMode: TrackViewMode.Grid }).pages[0];

            expect(staff.leadingWidthPx).toBe(staffLeadingWidth);
            expect(gridPage.systems[0].leadingWidthPx).toBe(printInstrumentColumnWidth + printInstrumentGap);
            expect(gridPage.systems[0].measures[0].offsetPx)
                .toBe(printInstrumentColumnWidth + printInstrumentGap);
        });

        it("derives the staff row heights from the notation its tracks hold", () => {
            const rest = restTrack(1, 2);
            const note = noteTrack(2, 2);
            const arrangement = arrangementOf(1, [rest, note]);

            const system = layoutOf({ arrangement, barCount: 2 }).pages[0].systems[0];
            const widths = new Map([[1, MeasureLayout.defaultWidth()], [2, MeasureLayout.defaultWidth()]]);
            const restHeight = StaffRowGeometry.ofTrack(rest, arrangement, grid, 1, widths).heightPx;
            const noteHeight = StaffRowGeometry.ofTrack(note, arrangement, grid, 1, widths).heightPx;

            expect(system.rowHeightsPx).toEqual([restHeight, noteHeight]);
            expect(system.heightPx).toBe(printStaffHeadRoom + restHeight + noteHeight + printRowGap);
        });

        it("gives every grid row the note cell height", () => {
            const arrangement = arrangementOf(1, [restTrack(1, 2), restTrack(2, 2)]);

            const system = layoutOf({ arrangement, barCount: 2, viewMode: TrackViewMode.Grid })
                .pages[0].systems[0];

            expect(system.rowHeightsPx).toEqual([printGridRowHeight, printGridRowHeight]);
            expect(system.heightPx).toBe(printGridHeadRoom + (2 * printGridRowHeight));
        });

        it("reserves the running header on every page and the title block on the first", () => {
            const arrangement = arrangementOf(1, [restTrack(1, 3)]);
            const layout = layoutOf({ arrangement, barCount: 3, printScale: 4 });
            const marginTopPx = standardMargins.top * pxPerMillimeter;

            expect(layout.pages.length).toBeGreaterThan(1);
            expect(layout.pages[0].contentTopPx).toBeCloseTo(marginTopPx + 28 + 60, 5);
            expect(layout.pages[1].contentTopPx).toBeCloseTo(marginTopPx + 28, 5);
            expect(layout.pages[1].availableHeightPx - layout.pages[0].availableHeightPx)
                .toBeCloseTo(60 / 4, 5);
        });

        it("states the page's available room from the print scale", () => {
            const arrangement = arrangementOf(1, [restTrack(1, 1)]);

            const layout = layoutOf({ arrangement, barCount: 1, printScale: 0.5 });

            expect(layout.pages[0].availableWidthPx).toBeCloseTo(layout.geometry.contentWidthPx / 0.5, 5);
            expect(layout.pages[0].availableHeightPx).toBeCloseTo(
                (layout.geometry.contentHeightPx - layout.geometry.runningHeaderHeightPx
                    - layout.geometry.titleBlockHeightPx) / 0.5, 5);
        });

        it("packs fewer measures per system at a larger print scale without changing the widths", () => {
            const arrangement = arrangementOf(1, [restTrack(1, 4)]);
            arrangement.measureWidths = new Map([[1, 150], [2, 150], [3, 150], [4, 150]]);
            const noMargins = { top: 0, right: 0, bottom: 0, left: 0 };

            const atOne = layoutOf({ arrangement, barCount: 4, margins: noMargins });
            const atTwo = layoutOf({ arrangement, barCount: 4, margins: noMargins, printScale: 2 });
            const widthsAtOne = atOne.pages.flatMap((page) => {
                return page.systems.flatMap((system) => {
                    return system.measures.map((measure) => {
                        return measure.widthPx;
                    });
                });
            });
            const widthsAtTwo = atTwo.pages.flatMap((page) => {
                return page.systems.flatMap((system) => {
                    return system.measures.map((measure) => {
                        return measure.widthPx;
                    });
                });
            });

            expect(atOne.pages[0].systems[0].measures).toHaveLength(3);
            expect(atTwo.pages[0].systems[0].measures).toHaveLength(1);
            expect(widthsAtOne).toEqual([150, 150, 150, 150]);
            expect(widthsAtTwo).toEqual([150, 150, 150, 150]);
        });

        it("keeps every system on one page and continues in measure order on the next", () => {
            const arrangement = arrangementOf(1, [restTrack(1, 40)]);
            arrangement.measureWidths = new Map(Array.from({ length: 40 }, (_, index): [number, number] => {
                return [index + 1, 100];
            }));

            const layout = layoutOf({ arrangement, barCount: 40 });

            expect(layout.pages.length).toBeGreaterThan(1);
            expect(systemBars(layout).flat()).toEqual(Array.from({ length: 40 }, (_, index) => {
                return index + 1;
            }));
            expect(layout.pages.map((page) => {
                return page.number;
            })).toEqual(layout.pages.map((_, index) => {
                return index + 1;
            }));
            expect(layout.pages[1].systems[0].topPx).toBe(0);

            for (const page of layout.pages) {
                expect(page.systems.length).toBeGreaterThan(0);
                for (const system of page.systems) {
                    expect(system.page).toBe(page.number);
                    expect(system.topPx + system.heightPx).toBeLessThanOrEqual(page.availableHeightPx);
                }
            }
        });

        it("starts a new page when the next system does not fit into the remaining room", () => {
            const arrangement = arrangementOf(1, Array.from({ length: 9 }, (_, index) => {
                return restTrack(index + 1, 4);
            }));
            arrangement.measureWidths = new Map([[1, 300], [2, 300], [3, 300], [4, 300]]);

            const layout = layoutOf({ arrangement, barCount: 4, viewMode: TrackViewMode.Grid });

            expect(layout.overflows).toEqual([]);
            expect(layout.pages).toHaveLength(4);
            for (const page of layout.pages) {
                expect(page.systems).toHaveLength(1);
                expect(page.systems[0].topPx).toBe(0);
            }
        });

        it("keeps one empty page when there is nothing to print", () => {
            const arrangement = arrangementOf(1, [restTrack(1, 1)]);

            const layout = layoutOf({ arrangement, barCount: 0 });

            expect(layout.pages).toHaveLength(1);
            expect(layout.pages[0].systems).toEqual([]);
            expect(layout.overflows).toEqual([]);
        });

        it("reports a measure that is wider than the page instead of shrinking it", () => {
            const arrangement = arrangementOf(1, [restTrack(1, 1)]);

            const layout = layoutOf({ arrangement, barCount: 1, widthOverrides: new Map([[1, 5000]]) });
            const system = layout.pages[0].systems[0];
            const [overflow] = overflowsOf(layout, PrintOverflowKind.MeasureTooWide);

            expect(system.measures[0].widthPx).toBe(5000);
            expect(layout.overflows).toHaveLength(1);
            expect(overflow.page).toBe(1);
            expect(overflow.firstBar).toBe(1);
            expect(overflow.lastBar).toBe(1);
            expect(overflow.requiredPx).toBe(system.widthPx);
            expect(overflow.availablePx).toBeCloseTo(layout.pages[0].availableWidthPx, 5);
            expect(overflow.requiredPx).toBeGreaterThan(overflow.availablePx);
        });

        it("reports a system taller than the page instead of shrinking it", () => {
            const arrangement = arrangementOf(1, Array.from({ length: 30 }, (_, index) => {
                return restTrack(index + 1, 2);
            }));

            const layout = layoutOf({ arrangement, barCount: 2, viewMode: TrackViewMode.Grid });
            const overflow = overflowsOf(layout, PrintOverflowKind.SystemTooTall)[0];

            expect(layout.pages).toHaveLength(2);
            expect(overflowsOf(layout, PrintOverflowKind.SystemTooTall)).toHaveLength(2);
            expect(overflow.page).toBe(1);
            expect(overflow.firstBar).toBe(1);
            expect(overflow.lastBar).toBe(1);
            expect(overflow.requiredPx).toBe(layout.pages[0].systems[0].heightPx);
            expect(overflow.requiredPx).toBeGreaterThan(overflow.availablePx);
        });

        it("reports nothing when every system fits", () => {
            const arrangement = arrangementOf(1, [restTrack(1, 3)]);

            expect(layoutOf({ arrangement, barCount: 3, printScale: 0.45 }).overflows).toEqual([]);
        });
    });
});
