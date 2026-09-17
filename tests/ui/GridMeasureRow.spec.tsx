/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";

import { GridMeasureRow } from "../../src/components/ui/Bar/Grid/GridMeasureRow.js";
import { Arrangement } from "../../src/core/Arrangement.js";
import { ScoreBookDataModel, type ISbDmTrackMeasure } from "../../src/core/ScoreBookDataModel.js";
import type { IMeasureEvent } from "../../src/core/types/general.js";
import { ScoreElementRegistry } from "../../src/ui/ScoreElementRegistry.js";
import { createInstrument, hydrateMeasureEvents } from "../unit-test-helpers.js";

interface IRenderedRow {
    row: HTMLElement;
    measure: ISbDmTrackMeasure;
    registry: ScoreElementRegistry;
}

/**
 * Renders the first measure of a fresh 4/4 track holding the given events.
 *
 * @param events The events the measure should hold.
 *
 * @returns The rendered row, its measure and the element registry behind it.
 */
const renderRow = (events: IMeasureEvent[]): IRenderedRow => {
    const model = new ScoreBookDataModel();
    model.startNewArrangement([createInstrument("0", 0, 0)]);

    const track = model.arrangement!.tracks[0];
    const measure = track.measures[0];
    measure.events.splice(0, measure.events.length, ...events);
    hydrateMeasureEvents(model.arrangement! as Arrangement);

    const registry = new ScoreElementRegistry();
    const result = render(<GridMeasureRow measure={measure} track={track} dataModel={model} barNumber={1}
        scoreElementRegistry={registry} />);

    return { row: result.container.querySelector<HTMLElement>(".grid-measure-row")!, measure, registry };
};

/**
 * Lists the cells the row holds directly, in display order.
 *
 * @param row The row to inspect.
 *
 * @returns The cells and subdivision containers of the row.
 */
const cellsOf = (row: HTMLElement): HTMLElement[] => {
    return [...row.querySelectorAll<HTMLElement>(":scope > .note-viewer, :scope > .subdivision")];
};

/**
 * Lists the start positions the row's cells address.
 *
 * @param registry The element registry behind the row.
 * @param cells The cells to read.
 *
 * @returns The start fraction of every cell, formatted as "numerator/denominator".
 */
const startsOf = (registry: ScoreElementRegistry, cells: HTMLElement[]): string[] => {
    return cells.map((cell) => {
        const { start } = registry.getLocation(cell) ?? {};

        return start === undefined ? "" : `${start.numerator}/${start.denominator}`;
    });
};

describe.sequential("GridMeasureRow", () => {
    afterEach(() => {
        cleanup();
    });

    it("renders one cell per step when every event lands on a step", () => {
        const { row } = renderRow([
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } },
        ]);

        expect(cellsOf(row)).toHaveLength(16);
    });

    it("renders a pair of thirty-seconds as a subdivision of its step", () => {
        const { row, registry } = renderRow([
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 32 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 32 }, duration: { numerator: 1, denominator: 32 } },
            { start: { numerator: 1, denominator: 16 }, duration: { numerator: 1, denominator: 16 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 8 }, duration: { numerator: 7, denominator: 8 } },
        ]);

        // The step holding the pair becomes a subdivision of itself; the row keeps 16 columns.
        const split = row.querySelectorAll<HTMLElement>(".grid-sub-step");
        expect(split).toHaveLength(1);
        expect(cellsOf(row)).toHaveLength(16);

        const slots = [...split[0].querySelectorAll<HTMLElement>(":scope > .note-viewer")];
        expect(slots).toHaveLength(2);
        expect(startsOf(registry, slots)).toEqual(["0/1", "1/32"]);

        // The slot holding the note keeps its real id; the slot holding the rest gets a synthetic one.
        const noteIds = slots.map((slot) => {
            return registry.getLocation(slot)?.noteId;
        });
        expect(noteIds[0]).toBeGreaterThan(0);
        expect(noteIds[1]).toBeLessThan(0);
    });

    it("addresses the steps behind a thirty-second pair by their own position", () => {
        const { row, registry } = renderRow([
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 32 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 32 }, duration: { numerator: 1, denominator: 32 } },
            { start: { numerator: 1, denominator: 16 }, duration: { numerator: 15, denominator: 16 } },
        ]);

        const cells = cellsOf(row);

        // The split step is one column; the steps behind it keep their own grid position.
        expect(startsOf(registry, cells.slice(1, 4))).toEqual(["1/16", "1/8", "3/16"]);
    });
});
