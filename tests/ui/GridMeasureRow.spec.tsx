/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { act, cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";

import { GridMeasureRow } from "../../src/components/ui/Bar/Grid/GridMeasureRow.js";
import { Arrangement } from "../../src/core/Arrangement.js";
import { ScoreBookDataModel, type ISbDmTrackPiece } from "../../src/core/ScoreBookDataModel.js";
import type { IMeasureEvent, IRepeatBar } from "../../src/core/types/general.js";
import { PlayerPlayState, type ArrangementPlayer } from "../../src/player/ArrangementPlayer.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import { ScoreElementRegistry } from "../../src/ui/ScoreElementRegistry.js";
import { createInstrument, hydrateMeasureEvents } from "../unit-test-helpers.js";

interface IRenderedRow {
    row: HTMLElement;
    measure: ISbDmTrackPiece;
    registry: ScoreElementRegistry;
}

/**
 * Renders the first measure of a fresh 4/4 track holding the given events.
 *
 * @param events The events the measure should hold.
 * @param simile Whether the measure carries a one-bar repeat mark.
 * @param repeat The repeat barlines the measure carries.
 *
 * @returns The rendered row, its measure and the element registry behind it.
 */
const renderRow = (events: IMeasureEvent[], simile = false, repeat?: IRepeatBar): IRenderedRow => {
    const model = new ScoreBookDataModel();
    model.startNewArrangement([createInstrument("0", 0, 0)]);

    const track = model.arrangement!.tracks[0];
    const measure = track.measures[0];
    measure.events.splice(0, measure.events.length, ...events);
    measure.simile = simile ? true : undefined;
    if (repeat !== undefined) {
        (model.arrangement! as Arrangement).repeatBars.set(1, repeat);
    }

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

describe("GridMeasureRow", { concurrent: false }, () => {
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

    it("shows the one-bar repeat mark instead of cells for a simile", () => {
        const { row, measure, registry } = renderRow([
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 1 } },
        ], true);

        expect(row.querySelector(".grid-simile-overlay")).not.toBeNull();
        expect(cellsOf(row)).toHaveLength(0);
        expect(registry.getTarget(row.querySelector<HTMLElement>(".grid-simile-overlay")!)).toBe(measure);
    });

    it("draws separate opening and closing repeat barlines without replacing cells", () => {
        const { row } = renderRow([
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 1 } },
        ], false, { start: true, end: true });

        const opening = row.querySelector(".grid-repeat-barline-start")!;
        const closing = row.querySelector(".grid-repeat-barline-end")!;
        expect(opening.querySelectorAll(".barline-view-dots")).toHaveLength(1);
        expect(closing.querySelectorAll(".barline-view-dots")).toHaveLength(1);
        expect(opening.querySelector(".barline-view-part")?.classList.contains("barline-view-thick")).toBe(true);
        expect(closing.querySelector(".barline-view-part")?.classList.contains("barline-view-dots")).toBe(true);
        expect(cellsOf(row)).toHaveLength(16);
    });

    it("draws repeat barlines alongside a simile", () => {
        const { row } = renderRow([
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 1 } },
        ], true, { end: true });

        expect(row.querySelectorAll(".grid-repeat-barline-end")).toHaveLength(1);
        expect(row.querySelectorAll(".grid-repeat-barline-start")).toHaveLength(0);
        expect(row.querySelector(".grid-simile-overlay")).not.toBeNull();
        expect(cellsOf(row)).toHaveLength(0);
    });

    it("renders playback content without registering source events and restores the simile on stop", async () => {
        const model = new ScoreBookDataModel();
        model.startNewArrangement([createInstrument("0", 0, 0)]);
        model.ensureBarAvailable(3);
        const track = model.arrangement!.tracks[0];
        const source = track.measures[0];
        source.events.splice(0, source.events.length,
            { start: { numerator: 0, denominator: 1 }, duration: { numerator: 1, denominator: 4 }, noteStyleId: "1" },
            { start: { numerator: 1, denominator: 4 }, duration: { numerator: 3, denominator: 4 } });
        const measure = track.measures[2];
        measure.simile = true;
        hydrateMeasureEvents(model.arrangement! as Arrangement);
        const registry = new ScoreElementRegistry();
        let playState = PlayerPlayState.Stopped;
        const player = {
            get state() {
                return playState;
            },
            trackPlayers: new Map([[track, {
                sourceOfBar: () => {
                    return source;
                },
            }]]),
        } as unknown as ArrangementPlayer;
        const { container } = render(<GridMeasureRow measure={measure} track={track} dataModel={model}
            arrangementPlayer={player} barNumber={3} scoreElementRegistry={registry} />);
        expect(container.querySelectorAll(".grid-simile-overlay")).toHaveLength(1);

        await act(async () => {
            playState = PlayerPlayState.Playing;
            await requisitions.execute("playerStateChanged", playState);
        });

        expect(container.querySelectorAll(".simile-playback-preview .note-viewer")).toHaveLength(16);
        expect(container.querySelectorAll(".grid-simile-overlay")).toHaveLength(0);
        expect(registry.findTargetElement(source.events[0])).toBeUndefined();
        expect(measure.simile).toBe(true);
        expect(measure.events).toHaveLength(1);

        await act(async () => {
            playState = PlayerPlayState.Stopped;
            await requisitions.execute("playerStateChanged", playState);
        });

        expect(container.querySelectorAll(".simile-playback-preview")).toHaveLength(0);
        expect(container.querySelectorAll(".grid-simile-overlay")).toHaveLength(1);
    });
});
