/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";

import { PrintSystemView } from "../../src/components/ui/Print/PrintSystemView.js";
import {
    printGridHeadRoom, printRowGap, printStaffHeadRoom, type IPrintMeasureColumn, type IPrintSystem,
} from "../../src/core/PrintLayout.js";
import {
    ScoreBookDataModel, type ISbDmInstrument, type ISbDmTrack,
} from "../../src/core/ScoreBookDataModel.js";
import type { IStaffRowGeometry } from "../../src/core/StaffRowGeometry.js";
import { TrackViewMode } from "../../src/core/types/general.js";
import type { IAudioData } from "../../src/core/types/general.js";
import { ArrangementPlayer } from "../../src/player/ArrangementPlayer.js";
import { SelectionManager } from "../../src/ui/SelectionManager.js";
import { createInstrument } from "../unit-test-helpers.js";

/** Geometry of a row whose staff's middle line sits 50 px below its top edge. */
const geometry: IStaffRowGeometry = { heightPx: 100, centrePx: 0, staffLineOffsetPx: 50 };

/** What a rendered system holds. */
interface IRenderSystemResult {
    readonly container: Element;
    readonly system: IPrintSystem;
}

describe("PrintSystemView", { concurrent: false }, () => {
    let renderResult: RenderResult | undefined;
    let selectionManager: SelectionManager | undefined;

    /**
     * Renders a system of the given view mode.
     *
     * @param viewMode The view mode the system is drawn in.
     * @param trackCount Number of tracks the system holds.
     * @param noteLine Highest staff line of the tracks' instruments.
     * @param measures The measure columns the system holds, in measure order.
     * @param onMeasureResized What a dragged boundary reports, which the drag handles exist for.
     *
     * @returns The rendered container and the system it was rendered from.
     */
    const renderSystem = (viewMode: TrackViewMode, trackCount = 2, noteLine?: number,
        measures: readonly IPrintMeasureColumn[] = [],
        onMeasureResized?: (bar: number, widthPx: number) => void): IRenderSystemResult => {
        const dataModel = new ScoreBookDataModel();
        const instruments: ISbDmInstrument[] = [];
        for (let index = 0; index < trackCount; index++) {
            const instrument = createInstrument(`track-${index}`, index);
            if (noteLine !== undefined) {
                instrument.noteStyles["1"] = { id: "1", noteLine } as IAudioData;
            }

            instruments.push(instrument);
        }

        // The system states its measures, so the arrangement has to hold them.
        const arrangement = dataModel.startNewArrangement(instruments,
            measures.length > 0 ? { length: measures.length } : undefined);
        const tracks = arrangement.tracks;
        const headRoom = viewMode === TrackViewMode.Staff ? printStaffHeadRoom : printGridHeadRoom;
        const rowGap = viewMode === TrackViewMode.Staff ? printRowGap : 0;
        const system: IPrintSystem = {
            page: 1,
            topPx: 0,
            leadingWidthPx: 200,
            widthPx: 1200,
            heightPx: headRoom + (tracks.length * geometry.heightPx) + ((tracks.length - 1) * rowGap),
            rowHeightsPx: tracks.map(() => {
                return geometry.heightPx;
            }),
            measures,
        };
        const rowGeometries = new Map<number, IStaffRowGeometry>(tracks.map((track: ISbDmTrack) => {
            return [track.id, geometry];
        }));

        selectionManager = new SelectionManager(dataModel);
        renderResult = render(
            <PrintSystemView
                system={system}
                viewMode={viewMode}
                tracks={tracks}
                rowGeometries={rowGeometries}
                arrangement={arrangement}
                arrangementPlayer={new ArrangementPlayer(dataModel)}
                dataModel={dataModel}
                selectionManager={selectionManager}
                onMeasureResized={onMeasureResized}
            />,
        );

        return { container: renderResult.container, system };
    };

    /**
     * @param rowCount Number of rows the system holds.
     *
     * @returns The top edge of the first row's staff lines and the bottom edge of the last row's, in layout px.
     */
    const stavesSpan = (rowCount: number): { topPx: number; bottomPx: number; } => {
        return {
            topPx: printStaffHeadRoom + geometry.staffLineOffsetPx,
            bottomPx: printStaffHeadRoom + ((rowCount - 1) * (geometry.heightPx + printRowGap))
                + geometry.staffLineOffsetPx,
        };
    };

    afterEach(() => {
        renderResult?.unmount();
        selectionManager?.dispose();
        cleanup();
        renderResult = undefined;
        selectionManager = undefined;
    });

    it("brackets the staves of a system, reaching evenly beyond them", () => {
        const { container } = renderSystem(TrackViewMode.Staff, 2);
        const bracket = container.querySelector<HTMLElement>(".print-system-bracket");
        expect(bracket).not.toBeNull();

        const top = Number.parseFloat(bracket!.style.top);
        const bottom = top + Number.parseFloat(bracket!.style.height);
        const staves = stavesSpan(2);

        // The bracket is a band of its own: it reaches beyond the outer staves at both ends, by the same room.
        expect(top).toBeLessThan(staves.topPx);
        expect(bottom).toBeGreaterThan(staves.bottomPx);
        expect(staves.topPx - top).toBeCloseTo(bottom - staves.bottomPx);
    });

    it("draws the bracket from the font's two ends and a line between them", () => {
        const { container } = renderSystem(TrackViewMode.Staff, 2);
        const bracket = container.querySelector(".print-system-bracket")!;

        expect(bracket.querySelector(".print-system-bracket-top")).not.toBeNull();
        expect(bracket.querySelector(".print-system-bracket-line")).not.toBeNull();
        expect(bracket.querySelector(".print-system-bracket-bottom")).not.toBeNull();
    });

    it("leaves a system of a single track unbracketed", () => {
        const { container } = renderSystem(TrackViewMode.Staff, 1);

        expect(container.querySelector(".print-system-bracket")).toBeNull();
    });

    it("opens the measures with a line that spans the staves", () => {
        const { container } = renderSystem(TrackViewMode.Staff, 2);
        const barline = container.querySelector<HTMLElement>(".print-system-barline");
        const staves = stavesSpan(2);
        expect(barline).not.toBeNull();

        expect(barline!.style.getPropertyValue("--barline-top")).toBe(`${staves.topPx}px`);
        expect(barline!.style.getPropertyValue("--barline-height")).toBe(`${staves.bottomPx - staves.topPx}px`);
    });

    it("states the half height of the outer staffs, which the clef's ink overhang is measured against", () => {
        const singleLine = renderSystem(TrackViewMode.Staff, 2);
        const singleBarline = singleLine.container.querySelector<HTMLElement>(".print-system-barline")!;

        expect(singleBarline.style.getPropertyValue("--barline-half-lines-top")).toBe("0");
        expect(singleBarline.style.getPropertyValue("--barline-half-lines-bottom")).toBe("0");

        renderResult?.unmount();
        selectionManager?.dispose();

        const tallerStaff = renderSystem(TrackViewMode.Staff, 2, 5);
        const tallerBarline = tallerStaff.container.querySelector<HTMLElement>(".print-system-barline")!;

        // A five-line staff reaches two staff spaces above and below its middle line.
        expect(tallerBarline.style.getPropertyValue("--barline-half-lines-top")).toBe("2");
        expect(tallerBarline.style.getPropertyValue("--barline-half-lines-bottom")).toBe("2");
    });

    it("spans the row block and drops the barline in grid mode", () => {
        const { container, system } = renderSystem(TrackViewMode.Grid, 2);
        const bracket = container.querySelector<HTMLElement>(".print-system-bracket")!;

        expect(bracket.style.top).toBe(`${printGridHeadRoom}px`);
        expect(Number.parseFloat(bracket.style.height)).toBeCloseTo(system.heightPx - printGridHeadRoom);
        expect(container.querySelector(".print-system-barline")).toBeNull();
        expect(container.querySelector(".print-system-prefix")).toBeNull();
    });

    it("closes every measure with a line and a drag handle on the same boundary", () => {
        const measures: IPrintMeasureColumn[] = [
            { bar: 1, offsetPx: 200, widthPx: 400 },
            { bar: 2, offsetPx: 600, widthPx: 400 },
        ];
        const { container } = renderSystem(TrackViewMode.Staff, 2, undefined, measures, () => {
            // The drag is not part of this test.
        });

        const barlines = [...container.querySelectorAll<HTMLElement>(".print-system > .print-system-barline")];
        const handles = [...container.querySelectorAll<HTMLElement>(".print-system-resize-handle")];
        const staves = stavesSpan(2);

        expect(barlines.map((barline) => {
            return barline.style.left;
        })).toEqual(["600px", "1000px"]);
        expect(handles.map((handle) => {
            return handle.style.left;
        })).toEqual(["600px", "1000px"]);

        // A handle covers no more than the line it sits on, so the page around it keeps taking the pointer.
        expect(handles[0].style.getPropertyValue("--barline-top")).toBe(`${staves.topPx}px`);
        expect(handles[0].style.getPropertyValue("--barline-height")).toBe(`${staves.bottomPx - staves.topPx}px`);
    });

    it("moves the lines of the following measures with the width of the dragged one", () => {
        const measures: IPrintMeasureColumn[] = [
            { bar: 1, offsetPx: 200, widthPx: 400 },
            { bar: 2, offsetPx: 600, widthPx: 400 },
        ];
        const resized: Array<{ bar: number; widthPx: number; }> = [];
        const { container } = renderSystem(TrackViewMode.Staff, 2, undefined, measures, (bar, widthPx) => {
            resized.push({ bar, widthPx });
        });

        const boundaries = (): string[] => {
            const lines = [...container.querySelectorAll<HTMLElement>(".print-system > .print-system-barline")];

            return lines.map((line) => {
                return line.style.left;
            });
        };

        expect(boundaries()).toEqual(["600px", "1000px"]);

        // The gesture follows the pointer on the window, so the boundary keeps growing while it is dragged.
        fireEvent.pointerDown(container.querySelector(".print-system-resize-handle")!, {
            button: 0, clientX: 400,
            pointerId: 1
        });
        fireEvent.pointerMove(window, { clientX: 500, pointerId: 1 });

        // Measure 1 is 100 px wider, and measure 2 starts and ends 100 px further right.
        expect(boundaries()).toEqual(["700px", "1100px"]);

        const handles = [...container.querySelectorAll<HTMLElement>(".print-system-resize-handle")];
        expect(handles.map((handle) => {
            return handle.style.left;
        })).toEqual(["700px", "1100px"]);

        fireEvent.pointerUp(window, { pointerId: 1 });
        expect(resized).toEqual([{ bar: 1, widthPx: 500 }]);

        // The gesture ends, so the system states the widths of the layout again.
        expect(boundaries()).toEqual(["600px", "1000px"]);
    });
});
