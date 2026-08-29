/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { bateriaInstruments } from "../../src/bateria-instruments.js";
import { Arrangement } from "../../src/core/Arrangement.js";
import { ScoreBookDataModel, type ISbDmTrackMeasure } from "../../src/core/ScoreBookDataModel.js";
import { PasteResultKind, ScoreClipboard } from "../../src/core/ScoreClipboard.js";
import { addFractions, compareFractions } from "../../src/core/serialisation/numeric-functions.js";
import { SelectionGranularity, type ISelectionEntry } from "../../src/ui/selection-types.js";
import { createInstrument, hydrateMeasureEvents } from "../unit-test-helpers.js";

const stepsPerBar = 16;

/**
 * Returns the note style id covering the given step of a measure, or undefined for rests.
 *
 * @param measure The measure to inspect.
 * @param step The 0-based grid step to look up.
 * @returns The note style id covering the step, or undefined.
 */
const noteAtStep = (measure: ISbDmTrackMeasure, step: number): string | undefined => {
    const start = { numerator: step, denominator: stepsPerBar };

    const event = measure.events.find((candidate) => {
        if (candidate.noteStyleId === undefined) {
            return false;
        }

        const end = addFractions(candidate.start, candidate.duration);

        return compareFractions(candidate.start, start) <= 0 && compareFractions(start, end) < 0;
    });

    return event?.noteStyleId;
};

/**
 * Resolves the runtime note id of the note that starts exactly at the given cell.
 *
 * @param measure The measure to inspect.
 * @param cell The 0-based grid cell.
 * @returns The note event id, or undefined when the cell is not a note start.
 */
const noteIdAtCell = (measure: ISbDmTrackMeasure, cell: number): number | undefined => {
    const start = { numerator: cell, denominator: stepsPerBar };
    const eventIndex = measure.events.findIndex((candidate) => {
        return compareFractions(candidate.start, start) === 0 && candidate.noteStyleId !== undefined;
    });

    return eventIndex >= 0 ? measure.noteEvents[eventIndex]?.id : undefined;
};

/**
 * Resolves the duration in cells of the note that starts exactly at the given cell.
 *
 * @param measure The measure to inspect.
 * @param cell The 0-based grid cell.
 * @returns The note's duration in whole cells, or 1 when the cell is not a note start.
 */
const noteDurationInCells = (measure: ISbDmTrackMeasure, cell: number): number => {
    const start = { numerator: cell, denominator: stepsPerBar };
    const event = measure.events.find((candidate) => {
        return compareFractions(candidate.start, start) === 0 && candidate.noteStyleId !== undefined;
    });

    return event ? (event.duration.numerator * stepsPerBar) / event.duration.denominator : 1;
};

/**
 * Computes the expected cell pattern after copying the first {@link copyCells} cells of a group and
 * tiling the clipboard across a 16-cell target.
 *
 * A range copy (two or more cells) copies every cell as one cell, so the clipboard is the pattern
 * itself. A lone note is copied with its full (absorbed) duration, so the clipboard is that single
 * note stretched across its cells.
 *
 * @param measure The source measure (correctly built via setGridNote).
 * @param pattern The four-bit pattern of the group (1 = note, 0 = rest).
 * @param groupStart The first cell of the group.
 * @param copyCells The number of cells to copy (1..4).
 * @returns The expected note style per target cell; undefined for rests.
 */
const expectedTiledPattern = (measure: ISbDmTrackMeasure, pattern: number[], groupStart: number,
    copyCells: number): Array<string | undefined> => {
    let clipboard: Array<{ cells: number; noteStyleId?: string; }>;

    if (copyCells === 1 && pattern[0] === 1) {
        clipboard = [{ cells: noteDurationInCells(measure, groupStart), noteStyleId: "note" }];
    } else {
        clipboard = [];
        for (let index = 0; index < copyCells; index++) {
            clipboard.push({ cells: 1, noteStyleId: pattern[index] === 1 ? "note" : undefined });
        }
    }

    const expected: Array<string | undefined> = [];
    let cell = 0;

    while (cell < stepsPerBar) {
        for (const event of clipboard) {
            for (let offset = 0; offset < event.cells && cell < stepsPerBar; offset++) {
                expected.push(event.noteStyleId);
                cell++;
            }
        }
    }

    return expected;
};

describe("ScoreClipboard pattern tiling", () => {
    const instruments = bateriaInstruments.map((instrument) => {
        return instrument.typeId;
    });

    const patterns = Array.from({ length: 16 }, (_, index) => {
        return [(index >> 3) & 1, (index >> 2) & 1, (index >> 1) & 1, index & 1];
    });

    for (const typeId of instruments) {
        describe(`instrument "${typeId}"`, () => {
            for (const pattern of patterns) {
                const variants = [
                    { name: "aligned", cells: [0, 1, 2, 3] },
                    { name: "straddling", cells: [2, 3, 4, 5] },
                ];

                for (const variant of variants) {
                    for (let copyCells = 1; copyCells <= 4; copyCells++) {
                        const label = `pattern ${pattern.join("")} ${variant.name} copies ${copyCells}`;

                        it(label, () => {
                            const model = new ScoreBookDataModel();
                            const clipboard = new ScoreClipboard(model);
                            const instrumentsForTest = [
                                createInstrument(typeId, 0, 0), createInstrument(typeId, 1, 1),
                            ];
                            model.startNewArrangement(instrumentsForTest);

                            const source = model.arrangement!.tracks[0];
                            const target = model.arrangement!.tracks[1];

                            for (let bit = 0; bit < 4; bit++) {
                                if (pattern[bit] === 1) {
                                    model.setGridNote(source.id, 1, variant.cells[bit], "note");
                                }
                            }

                            hydrateMeasureEvents(model.arrangement! as Arrangement);

                            const groupStart = variant.cells[0];
                            const entries: ISelectionEntry[] = [];

                            for (let offset = 0; offset < copyCells; offset++) {
                                const cell = groupStart + offset;
                                const entry: ISelectionEntry = {
                                    granularity: SelectionGranularity.Note, bar: 1, trackId: source.id,
                                    startStep: cell, endStep: cell,
                                };

                                if (pattern[offset] === 1) {
                                    entry.noteId = noteIdAtCell(source.measures[0], cell);
                                }

                                entries.push(entry);
                            }

                            clipboard.copy(entries);

                            const result = clipboard.paste([
                                { granularity: SelectionGranularity.TrackPiece, bar: 1, trackId: target.id },
                            ]);

                            expect(result.kind).toBe(PasteResultKind.Success);

                            const expected = expectedTiledPattern(source.measures[0], pattern, groupStart,
                                copyCells);
                            for (let cell = 0; cell < stepsPerBar; cell++) {
                                expect(noteAtStep(target.measures[0], cell), `cell ${cell}`).toBe(expected[cell]);
                            }
                        });
                    }
                }
            }
        });
    }
});
