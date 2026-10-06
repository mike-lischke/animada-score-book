/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";

import { StaffNoteViewer } from "../../src/components/ui/Note/StaffNoteViewer.js";
import {
    Damping, ExcitationMode, HandTechnique, NoteDisplayType, SbDmEntityType, type ISbDmNoteEvent, type ISbDmTrack,
    type ISbDmTrackPiece, type ISampleProfile,
} from "../../src/core/ScoreBookDataModel.js";
import type {
    IAudioData, IFraction, IForteMark, IHairpin, IMeasureEvent, IRangeArticulation, IRepeatBar, ISubdivision,
} from "../../src/core/types/general.js";
import { RangeArticulationKind } from "../../src/core/types/general.js";
import type { IScoreMetrics } from "../../src/player/TimeCoordinator.js";
import { ScoreElementKind, ScoreElementRegistry } from "../../src/ui/ScoreElementRegistry.js";

const fraction = (numerator: number, denominator: number): IFraction => {
    return { numerator, denominator };
};

/** Width of a partial beam: its fixed length plus the stem's right edge, which it ends on. */
const beamStubWidth = "calc(12px + var(--stem-right-edge, 0px))";

/**
 * @param barline The barline element to read.
 *
 * @returns The parts the barline is drawn from, in drawing order.
 */
const partsOf = (barline: Element): string[] => {
    return [...barline.querySelectorAll(".barline-view-part")].map((part) => {
        return part.className.replace("barline-view-part barline-view-", "");
    });
};

const event = (start: IFraction, duration: IFraction, noteStyleId?: string) => {
    return noteStyleId === undefined
        ? { start, duration }
        : { start, duration, noteStyleId };
};

/**
 * Builds a track measure with resolved note events for the given event stream.
 *
 * @param events The measure content (notes and rests).
 * @param subdivisions Subdivision groups annotating the event stream.
 * @param sampleProfile Optional articulation profile for the resolved note style.
 * @param handTechnique Optional hand technique for the resolved note style.
 * @param displayType Optional note head shape drawn for the note style.
 *
 * @returns The measure with resolved note events.
 */
const buildMeasure = (events: IMeasureEvent[], subdivisions: ISubdivision[],
    sampleProfile: ISampleProfile = { builtInDamping: Damping.Open, builtInAccent: false, ghost: false },
    handTechnique?: HandTechnique,
    displayType: NoteDisplayType = NoteDisplayType.Oval,
): ISbDmTrackPiece => {
    const instrument = {
        type: SbDmEntityType.Instrument,
        id: 1,
        noteStyles: {},
    } as unknown as ISbDmTrack["instrument"];

    const audioData = {
        id: "1",
        audioBuffer: null,
        instrument,
        characteristics: {
            excitationMode: ExcitationMode.Struck,
            mainDisplayType: displayType,
            handTechnique,
        },
        sampleProfile,
    } as unknown as IAudioData;

    const track = { id: 100 } as ISbDmTrack;
    const measure: ISbDmTrackPiece = {
        type: SbDmEntityType.TrackPiece,
        id: 13,
        track,
        number: 1,
        meter: {
            beats: 4,
            beatUnits: 4,
            stepResolution: 16,
            beatGroups: [4, 4, 4, 4],
        },
        events,
        subdivisions,
        noteEvents: [],
    };

    const noteEvents = events.map((measureEvent, index): ISbDmNoteEvent => {
        return {
            type: SbDmEntityType.NoteEvent,
            id: (100 * 1_000_000) + (1 * 1_000) + index,
            measure,
            start: { ...measureEvent.start },
            duration: { ...measureEvent.duration },
            track,
            timing: { bar: 1, step: 0 },
            audioData: measureEvent.noteStyleId !== undefined ? audioData : undefined,
        };
    });

    measure.noteEvents.push(...noteEvents);

    return measure;
};

/**
 * Builds the nested 3:8 → 2:1 → 2:1 subdivision from the grid-editing feature.
 * Bar 1 (4/4, 16 steps): eight sixteenths followed by a half-bar 3:8 tuplet whose
 * second slot is a 2:1 duplet with a nested 2:1 duplet in its first slot.
 *
 * @returns The measure with resolved note events.
 */
const buildNestedMeasure = (): ISbDmTrackPiece => {
    const events = [
        ...Array.from({ length: 8 }, (_, index) => {
            return event(fraction(index, 16), fraction(1, 16), "1");
        }),
        event(fraction(1, 2), fraction(1, 6), "1"),
        event(fraction(2, 3), fraction(1, 24), "1"),
        event(fraction(17, 24), fraction(1, 24), "1"),
        event(fraction(3, 4), fraction(1, 12), "1"),
        event(fraction(5, 6), fraction(1, 6), "1"),
    ];

    const subdivisions = [
        { startIndex: 8, actual: 3, normal: 8, isTuplet: true },
        { startIndex: 9, actual: 2, normal: 1, isTuplet: false },
        { startIndex: 9, actual: 2, normal: 1, isTuplet: false },
    ];

    return buildMeasure(events, subdivisions);
};

const scoreMetrics: IScoreMetrics = {
    realTimeLength: 2,
    secondsPerBar: 2,
    secondsPerStep: 0.125,
    bars: 1,
    performedBars: 1,
    beatsPerBar: 4,
    beatUnit: 4,
    pulsesPerBar: 4,
    stepsPerBar: 16,
    beatGroups: [4, 4, 4, 4],
    stepsPerPulse: 4,
};

/**
 * Builds the measure of the reported case: fifteen sixteenths, then a thirty-second rest and a
 * thirty-second note at the very end of the bar.
 *
 * @returns The measure with resolved note events.
 */
const buildFullBarEndingInThirtySecond = (): ISbDmTrackPiece => {
    const events = [
        ...Array.from({ length: 15 }, (_, index) => {
            return event(fraction(index, 16), fraction(1, 16), "1");
        }),
        event(fraction(15, 16), fraction(1, 32)),
        event(fraction(31, 32), fraction(1, 32), "1"),
    ];

    return buildMeasure(events, []);
};

/**
 * Builds a measure with one beamed group of sixteenths, each note on the staff line the caller
 * gives, followed by a rest so the group ends there.
 *
 * @param noteLines The staff line of each note, in measure order.
 *
 * @returns The measure with resolved note events.
 */
const buildMultiLineBeamMeasure = (noteLines: number[]): ISbDmTrackPiece => {
    const events = [
        ...noteLines.map((_, index) => {
            return event(fraction(index, 16), fraction(1, 16), "1");
        }),
        event(fraction(noteLines.length, 16), fraction(16 - noteLines.length, 16)),
    ];

    const measure = buildMeasure(events, []);

    measure.noteEvents.forEach((noteEvent, index) => {
        if (noteEvent.audioData !== undefined) {
            noteEvent.audioData = { ...noteEvent.audioData, noteLine: noteLines[index] };
        }
    });

    return measure;
};

describe("StaffNoteViewer beams", { concurrent: false }, () => {
    let renderResult: RenderResult | null;

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    it("beams nested subdivisions without crossing tuplet boundaries", () => {
        const measure = buildNestedMeasure();

        renderResult = render(
            <StaffNoteViewer
                isLastBar={true}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        const runs = [...renderResult.container.querySelectorAll<HTMLElement>(".staff-note-viewer-run")];
        expect(runs).toHaveLength(13);

        // Note runs are anchored at their onset; the render tree only contains notes here.
        expect(runs.every((run) => {
            return run.classList.contains("staff-note-viewer-note-run");
        })).toBe(true);

        const beamWidths = runs.map((run) => {
            return [...run.querySelectorAll<HTMLElement>(".staff-note-viewer-beam")].map((beam) => {
                return beam.style.width;
            });
        });

        // The eight sixteenths are beamed in two pulse groups with two beams each.
        // The last sixteenth of the second group must not carry a beam into the tuplet.
        for (let index = 0; index < 8; index++) {
            expect(beamWidths[index]).toHaveLength(2);
        }

        expect(beamWidths[3]).toEqual([beamStubWidth, beamStubWidth]);
        expect(beamWidths[7]).toEqual([beamStubWidth, beamStubWidth]);

        // The 3:8 slots (events 8 and 12) are eighths; the outer 2:1 slot (event 11) is a
        // sixteenth and the inner 2:1 slots (events 9 and 10) are thirty-seconds. The tuplet
        // group is beamed as one run whose outer beam spans all five notes.
        expect(beamWidths[8]).toEqual(["100%"]);
        expect(beamWidths[9]).toEqual(["100%", "100%", "100%"]);
        expect(beamWidths[10]).toEqual(["100%", "100%", beamStubWidth]);
        expect(beamWidths[11]).toEqual(["100%", beamStubWidth]);
        expect(beamWidths[12]).toEqual([beamStubWidth]);
    });

    it("positions the tuplet marker over the first and last noteheads", () => {
        const measure = buildNestedMeasure();

        renderResult = render(
            <StaffNoteViewer
                isLastBar={true}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        const bracket = renderResult.container.querySelector<HTMLElement>(".staff-note-viewer-tuplet-bracket");
        expect(bracket).not.toBeNull();
        if (!bracket) {
            return;
        }

        // First note starts at 1/2, last at 5/6; both noteheads sit half a step (1/32) later.
        const leftPercent = parseFloat(bracket.style.left);
        const widthPercent = parseFloat(bracket.style.width);
        expect(leftPercent).toBeCloseTo(53.125, 3);
        expect(widthPercent).toBeCloseTo(33.333, 3);
    });

    it("brackets a tuplet over its rests, not only over its notes", () => {
        const events = [
            ...Array.from({ length: 8 }, (_, index) => {
                return event(fraction(index, 16), fraction(1, 16), "1");
            }),
            event(fraction(1, 2), fraction(1, 6)),
            event(fraction(2, 3), fraction(1, 6), "1"),
            event(fraction(5, 6), fraction(1, 6)),
        ];

        const measure = buildMeasure(events, [
            { startIndex: 8, actual: 3, normal: 8, isTuplet: true },
        ]);

        renderResult = render(
            <StaffNoteViewer
                isLastBar={true}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        const bracket = renderResult.container.querySelector<HTMLElement>(".staff-note-viewer-tuplet-bracket");
        expect(bracket).not.toBeNull();
        if (!bracket) {
            return;
        }

        // The 3:8 group holds a single note between two rests. The bracket has to span the whole
        // group — from the first rest's position to the last rest's — and not only the note. A rest
        // sits centred in its slot, so the bracket runs from 7/12 to 11/12.
        const leftPercent = parseFloat(bracket.style.left);
        const widthPercent = parseFloat(bracket.style.width);
        expect(leftPercent).toBeCloseTo(58.333, 3);
        expect(widthPercent).toBeCloseTo(33.333, 3);
    });

    it("beams a pair of thirty-seconds outside a subdivision", () => {
        const measure = buildMeasure([
            event(fraction(0, 1), fraction(1, 32), "1"),
            event(fraction(1, 32), fraction(1, 32), "1"),
            event(fraction(1, 16), fraction(15, 16)),
        ], []);

        renderResult = render(
            <StaffNoteViewer
                isLastBar={true}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        const runs = [...renderResult.container.querySelectorAll<HTMLElement>(".staff-note-viewer-run")];
        const beams = runs.map((run) => {
            return [...run.querySelectorAll<HTMLElement>(".staff-note-viewer-beam")].map((beam) => {
                return beam.style.width;
            });
        });

        // Both notes carry three beam levels: the first bridges to its neighbour, the second stubs back.
        expect(beams[0]).toEqual(["100%", "100%", "100%"]);
        expect(beams[1]).toEqual([beamStubWidth, beamStubWidth, beamStubWidth]);
    });

    it("beams a pair of dotted thirty-seconds with three beams", () => {
        const measure = buildMeasure([
            event(fraction(0, 1), fraction(3, 64), "1"),
            event(fraction(3, 64), fraction(3, 64), "1"),
            event(fraction(3, 32), fraction(29, 32)),
        ], []);

        renderResult = render(
            <StaffNoteViewer
                isLastBar={true}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        const runs = [...renderResult.container.querySelectorAll<HTMLElement>(".staff-note-viewer-run")];
        const beamCounts = runs.map((run) => {
            return run.querySelectorAll(".staff-note-viewer-beam").length;
        });

        expect(beamCounts.slice(0, 2)).toEqual([3, 3]);
    });

    it("beams a 2:1 split of a step as thirty-seconds", () => {
        const measure = buildMeasure([
            event(fraction(0, 1), fraction(1, 32), "1"),
            event(fraction(1, 32), fraction(1, 32), "1"),
            event(fraction(1, 16), fraction(15, 16)),
        ], [{ startIndex: 0, actual: 2, normal: 1, isTuplet: false }]);

        renderResult = render(
            <StaffNoteViewer
                isLastBar={true}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        const runs = [...renderResult.container.querySelectorAll<HTMLElement>(".staff-note-viewer-run")];
        const beamCounts = runs.map((run) => {
            return run.querySelectorAll(".staff-note-viewer-beam").length;
        });

        // The slots hold thirty-seconds, so they need three beams even though the split nests once.
        expect(beamCounts.slice(0, 2)).toEqual([3, 3]);
    });

    it("points the trailing beam stub towards the group for mixed durations", () => {
        const measure = buildMeasure([
            event(fraction(0, 16), fraction(1, 16), "1"),
            event(fraction(1, 16), fraction(1, 8), "1"),
            event(fraction(3, 16), fraction(1, 16), "1"),
        ], []);

        renderResult = render(
            <StaffNoteViewer
                isLastBar={true}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        const runs = [...renderResult.container.querySelectorAll<HTMLElement>(".staff-note-viewer-run")];
        expect(runs).toHaveLength(3);

        const beams = runs.map((run) => {
            return [...run.querySelectorAll<HTMLElement>(".staff-note-viewer-beam")].map((beam) => {
                return { left: beam.style.left, width: beam.style.width };
            });
        });

        // The first sixteenth stubs right, the middle eighth bridges the primary beam, and the last
        // sixteenth stubs both its beams left towards the group.
        expect(beams[0]).toEqual([
            { left: "calc(var(--note-anchor) - var(--stem-half-width, 1px))", width: "100%" },
            { left: "calc(var(--note-anchor) - var(--stem-half-width, 1px))", width: beamStubWidth },
        ]);
        expect(beams[1]).toEqual([
            { left: "calc(var(--note-anchor) - var(--stem-half-width, 1px))", width: "100%" },
        ]);
        expect(beams[2]).toEqual([
            { left: "calc(var(--note-anchor) - 12px)", width: beamStubWidth },
            { left: "calc(var(--note-anchor) - 12px)", width: beamStubWidth },
        ]);
    });

    it("ends every stem of a group on one shared beam line across staff lines", () => {
        // Four sixteenths of one beam group, on four different lines. The group draws one beam line for
        // all of them, so each stem ends where that line is instead of above its own notehead.
        const measure = buildMultiLineBeamMeasure([1, 3, 2, 4]);

        renderResult = render(
            <StaffNoteViewer
                isLastBar={false}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
                maxNoteLine={4}
            />,
        );

        const runs = [
            ...renderResult.container.querySelectorAll<HTMLElement>(".staff-note-viewer-note-run"),
        ];
        expect(runs).toHaveLength(4);

        // The centre line is 2.5 and the highest note sits on line 1, so the shared beam line lies
        // 2.5 - 1 + 3.5 = 5 staff spaces above the reference line for every note of the group.
        expect(runs.map((run) => {
            return run.style.getPropertyValue("--beam-top");
        })).toEqual([
            "calc(var(--staff-space) * 5)",
            "calc(var(--staff-space) * 5)",
            "calc(var(--staff-space) * 5)",
            "calc(var(--staff-space) * 5)",
        ]);

        // Each stem reaches that one line from its own note's line: (line - 1) + 3.5 staff spaces.
        expect(runs.map((run) => {
            return run.style.getPropertyValue("--stem-tip");
        })).toEqual([
            "calc(var(--staff-space) * 3.5)",
            "calc(var(--staff-space) * 5.5)",
            "calc(var(--staff-space) * 4.5)",
            "calc(var(--staff-space) * 6.5)",
        ]);
    });

    it("draws adjacent rests in one pulse as the measure holds them", () => {
        // The rests a measure holds are its structure, so the viewer draws them one by one instead of
        // merging them into a rest of their combined length.
        const measure = buildMeasure([
            event(fraction(0, 16), fraction(1, 8)),
            event(fraction(2, 16), fraction(1, 8)),
            event(fraction(4, 16), fraction(1, 16), "1"),
        ], []);

        renderResult = render(
            <StaffNoteViewer
                isLastBar={true}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        const runs = [
            ...renderResult.container.querySelectorAll<HTMLElement>(".staff-note-viewer-run"),
        ];
        expect(runs).toHaveLength(3);

        const restRuns = runs.filter((run) => {
            return !run.classList.contains("staff-note-viewer-note-run");
        });
        expect(restRuns).toHaveLength(2);
    });

    it("registers the whole-measure rest as a selectable staff run", () => {
        const measure = buildMeasure([
            event(fraction(0, 1), fraction(1, 1)),
        ], []);

        const registry = new ScoreElementRegistry();
        renderResult = render(
            <StaffNoteViewer
                isLastBar={true}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
                scoreElementRegistry={registry}
            />,
        );

        const runs = registry.findElements(ScoreElementKind.StaffRun, 1, 100);
        expect(runs).toHaveLength(1);

        const location = registry.getLocation(runs[0]);
        expect(location).toMatchObject({
            kind: ScoreElementKind.StaffRun,
            bar: 1,
            trackId: 100,
            step: 0,
            start: { numerator: 0, denominator: 1 },
        });
        expect(location?.measure).toBe(measure);

        // The run addresses the rest it draws, so a hit test selects the rest instead of the bar.
        expect(registry.getTarget(runs[0])).toBe(measure.events[0]);
    });

    it("draws the slots of a subdivision whose slots hold rests only", () => {
        // A bar that holds nothing but a subdivision of rests is not collapsed into one whole rest:
        // its slots are the structure the user edited, so they stay visible (and addressable).
        const measure = buildMeasure([
            event(fraction(0, 1), fraction(1, 3)),
            event(fraction(1, 3), fraction(1, 3)),
            event(fraction(2, 3), fraction(1, 3)),
        ], [{ startIndex: 0, actual: 3, normal: 16, isTuplet: true }]);

        renderResult = render(
            <StaffNoteViewer
                isLastBar={true}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        const runs = [...renderResult.container.querySelectorAll<HTMLElement>(".staff-note-viewer-run")];
        expect(runs).toHaveLength(3);
        expect(runs.every((run) => {
            return run.querySelector(".staff-note-viewer-rest-symbol") !== null;
        })).toBe(true);
    });

    it("draws a measure whose rests the user split as the parts they are", () => {
        // Two half rests in a silent bar stay two half rests: the model holds the split, so the viewer
        // must not collapse it into a whole-measure rest again.
        const measure = buildMeasure([
            event(fraction(0, 1), fraction(1, 2)),
            event(fraction(1, 2), fraction(1, 2)),
        ], []);

        renderResult = render(
            <StaffNoteViewer
                isLastBar={true}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        const runs = [...renderResult.container.querySelectorAll<HTMLElement>(".staff-note-viewer-run")];
        expect(runs).toHaveLength(2);
        expect(runs.every((run) => {
            return run.querySelector(".staff-note-viewer-rest-symbol") !== null;
        })).toBe(true);

        // Each part keeps half the bar, so the two rests read as halves of the same length.
        const widths = runs.map((run) => {
            return run.style.flex.split(" ")[0];
        });
        expect(widths[0]).toBe(widths[1]);
    });

    it("shows ghost parentheses from the note style's sample profile", () => {
        const measure = buildMeasure([
            event(fraction(0, 16), fraction(1, 16), "1"),
        ], [], { builtInDamping: Damping.Open, builtInAccent: false, ghost: true });

        renderResult = render(
            <StaffNoteViewer
                isLastBar={true}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        expect(renderResult.container.querySelector(".staff-note-head-paren-left")).not.toBeNull();
        expect(renderResult.container.querySelector(".staff-note-head-paren-right")).not.toBeNull();
    });

    it("shows the accent mark from the note style's sample profile", () => {
        const measure = buildMeasure([
            event(fraction(0, 16), fraction(1, 16), "1"),
        ], [], { builtInDamping: Damping.Open, builtInAccent: true, ghost: false });

        renderResult = render(
            <StaffNoteViewer
                isLastBar={true}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        expect(renderResult.container.querySelector(".staff-note-head-accent")).not.toBeNull();
    });

    it("renders icons for every additional hand technique", () => {
        const techniques = [
            { technique: HandTechnique.Thumb, className: "staff-note-head-thumb-svg" },
            { technique: HandTechnique.Fingers, className: "staff-note-head-fingers-svg" },
            { technique: HandTechnique.Heel, className: "staff-note-head-heel-circle" },
            { technique: HandTechnique.Open, className: "staff-note-head-open-circle" },
            { technique: HandTechnique.Friction, className: "staff-note-head-friction-svg" },
        ];
        techniques.forEach(({ technique, className }) => {
            const measure = buildMeasure([
                event(fraction(0, 16), fraction(1, 16), "1"),
            ], [], undefined, technique);
            const result = render(
                <StaffNoteViewer
                    isLastBar={true}
                    timeSignature="4/4"
                    scoreMetrics={scoreMetrics}
                    baseSteps={16}
                    measure={measure}
                    barNumber={1}
                    trackId={100}
                />,
            );

            expect(result.container.querySelector(`.${className}`)).not.toBeNull();
            result.unmount();
        });
    });

    it("draws a technique cross as a symbol of its own, not the note head's", () => {
        const measure = buildMeasure(
            [event(fraction(0, 16), fraction(1, 16), "1")], [], undefined, HandTechnique.Slap,
            NoteDisplayType.Cross,
        );

        renderResult = render(
            <StaffNoteViewer
                isLastBar={true}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        const headCross = renderResult.container.querySelector(".staff-note-head-symbol path");
        const slapCross = renderResult.container.querySelector(".staff-note-head-slap-svg path");

        // The head's cross is the catalogue's own path, while a technique draws a symbol of its own,
        // so neither can decide the geometry of the other.
        expect(headCross).not.toBeNull();
        expect(headCross?.getAttribute("d")).toContain("M0.1 0.1");
        expect(slapCross).not.toBeNull();
        expect(slapCross?.getAttribute("d")).not.toBe(headCross?.getAttribute("d"));
    });

    it("states the staff's line count for the closing barline", () => {
        const measure = buildMeasure([
            event(fraction(0, 16), fraction(1, 16), "1"),
        ], []);

        renderResult = render(
            <StaffNoteViewer
                isLastBar={true}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
                maxNoteLine={4}
            />,
        );

        const viewer = renderResult.container.querySelector<HTMLElement>(".staff-note-viewer")!;

        // The stylesheet derives the closing barline's height from the count, which the viewer states.
        expect(viewer.style.getPropertyValue("--staff-line-count")).toBe("4");
    });

    it("gives a single-line staff a barline stub of two staff spaces on either side", () => {
        const measure = buildMeasure([
            event(fraction(0, 16), fraction(1, 16), "1"),
        ], []);

        renderResult = render(
            <StaffNoteViewer
                isLastBar={false}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        const viewer = renderResult.container.querySelector<HTMLElement>(".staff-note-viewer")!;

        // The single line has no height of its own, so the barline stands the two staff spaces of a one-line system.
        expect(viewer.style.getPropertyValue("--staff-barline-height")).toBe("20px");

        // The barline is drawn, in the thin thickness the font states, over the band the viewer states.
        expect(partsOf(viewer.querySelector(".staff-note-viewer-barline")!)).toEqual(["thin"]);
    });

    it("keeps the flags of a final thirty-second note inside the bar", () => {
        const measure = buildFullBarEndingInThirtySecond();

        renderResult = render(
            <StaffNoteViewer
                isLastBar={false}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        const runs = [...renderResult.container.querySelectorAll<HTMLElement>(".staff-note-viewer-run")];
        expect(runs).toHaveLength(17);

        // The note's onset anchor would sit on the barline, so it is right-aligned to its slot
        // instead and keeps the width of its flags free there. No barline reaches into this bar.
        expect(runs[16].getAttribute("style"))
            .toContain("--note-anchor: calc(100% - var(--note-flag-width) - var(--staff-note-clearance, 0px))");
        expect(renderResult.container.querySelector<HTMLElement>(".staff-note-viewer")?.style
            .getPropertyValue("--staff-note-clearance")).toBe("0px");

        // The sixteenth before the final half step keeps its onset anchor.
        expect(runs[14].getAttribute("style")).toContain("--note-anchor: 50%");
    });

    it("reserves the final barline in the last bar", () => {
        const measure = buildFullBarEndingInThirtySecond();

        renderResult = render(
            <StaffNoteViewer
                isLastBar={true}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        const runs = [...renderResult.container.querySelectorAll<HTMLElement>(".staff-note-viewer-run")];

        // The final barline is drawn inside the bar, so the viewer states it as the clearance the notes keep.
        expect(renderResult.container.querySelector<HTMLElement>(".staff-note-viewer")?.style
            .getPropertyValue("--staff-note-clearance")).toBe("var(--barline-final-width)");
        expect(runs[16].getAttribute("style"))
            .toContain("--note-anchor: calc(100% - var(--note-flag-width) - var(--staff-note-clearance, 0px))");
    });

    it("anchors a thirty-second note that does not end the measure at its slot", () => {
        const measure = buildMeasure([
            event(fraction(0, 1), fraction(1, 32), "1"),
            event(fraction(1, 32), fraction(31, 32)),
        ], []);

        renderResult = render(
            <StaffNoteViewer
                isLastBar={false}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        const runs = [...renderResult.container.querySelectorAll<HTMLElement>(".staff-note-viewer-run")];
        expect(runs[0].getAttribute("style")).toContain("--note-anchor: 100%");
    });

    it("draws a rest inside a subdivision with the value of its subdivision", () => {
        const measure = buildMeasure([
            event(fraction(0, 1), fraction(1, 24), "1"),
            event(fraction(1, 24), fraction(1, 24)),
            event(fraction(1, 12), fraction(1, 24), "1"),
            event(fraction(1, 8), fraction(7, 8)),
        ], [{ startIndex: 0, actual: 3, normal: 2, isTuplet: true }]);

        renderResult = render(
            <StaffNoteViewer
                isLastBar={false}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
            />,
        );

        // The slot's duration matches no value, so the rest is drawn with the value its subdivision
        // stands for — the same one the toolbars mark for a selected slot.
        const restSymbol = renderResult.container.querySelector(".staff-note-viewer-rest-symbol text");
        expect(restSymbol?.textContent).toBe(String.fromCodePoint(0xE4E6));
    });

    it("draws the one-bar repeat mark instead of notes for a simile", () => {
        const measure = buildMeasure([
            event(fraction(0, 1), fraction(1, 4), "1"),
            event(fraction(1, 4), fraction(3, 4)),
        ], []);
        measure.simile = true;

        renderResult = render(
            <StaffNoteViewer
                isLastBar={false}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={2}
                trackId={100}
            />,
        );

        const run = renderResult.container.querySelector(".staff-note-viewer-simile");
        expect(run).not.toBeNull();
        expect(run?.querySelector("text")?.textContent).toBe(String.fromCodePoint(0xE500));
        expect(renderResult.container.querySelector(".staff-note-viewer-note-run")).toBeNull();
    });
});

describe("StaffNoteViewer barlines", { concurrent: false }, () => {
    let renderResult: RenderResult | null;

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    /**
     * Renders one piece with the repeat marks its bar carries.
     *
     * @param barNumber The 1-based bar of the piece.
     * @param marks The repeat marks, keyed by 1-based bar number.
     * @param isLastBar Whether the piece is the last bar of the score.
     * @param events The content of the bar; a sixteenth note by default.
     *
     * @returns The rendered piece.
     */
    const renderBarline = (barNumber: number, marks: Record<number, IRepeatBar>,
        isLastBar = false, events = [event(fraction(0, 16), fraction(1, 16), "1")]): HTMLElement => {
        const measure = buildMeasure(events, []);

        renderResult = render(
            <StaffNoteViewer
                isLastBar={isLastBar}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={barNumber}
                trackId={100}
                repeatBars={new Map(Object.entries(marks).map(([bar, repeatBar]) => {
                    return [Number(bar), repeatBar];
                }))}
            />,
        );

        return renderResult.container.querySelector<HTMLElement>(".staff-note-viewer")!;
    };

    it("closes the piece with the repeat barline the marks call for", () => {
        const viewer = renderBarline(2, { 2: { end: true } });
        const barline = viewer.querySelector(".staff-note-viewer-barline")!;

        // The dots of a repeat that closes a section reach into the bar, so the viewer states the ink the notes
        // keep clear of: the dots, then the strokes of the barline.
        expect(partsOf(barline)).toEqual(["dots", "thin", "thick"]);
        expect(viewer.style.getPropertyValue("--staff-note-clearance"))
            .toBe("calc(var(--barline-repeat-width) + var(--staff-repeat-dot-gap))");
        expect(viewer.style.getPropertyValue("--staff-barline-width")).toBe("var(--barline-repeat-width)");

        // The barline of a bar sits on the boundary it closes, so nothing stands inside the bar on its left, and
        // the dots of the barline reach into it on the right, so the notes stay clear of that ink.
        expect(viewer.style.getPropertyValue("--staff-opening-barline-room")).toBe("0px");
        expect(viewer.style.getPropertyValue("--staff-closing-barline-room"))
            .toBe("calc(var(--barline-repeat-width) + var(--staff-repeat-dot-gap))");
    });

    it("draws a repeat that only opens as the barline of the bar it opens", () => {
        // The bar before it keeps none: a barline sits between two bars and a repeat is drawn once.
        expect(renderBarline(1, { 2: { start: true } }).querySelector(".staff-note-viewer-barline")).toBeNull();

        const viewer = renderBarline(2, { 2: { start: true } });
        const leading = viewer.querySelector(".staff-note-viewer-barline-start")!;

        // The thick stroke stands on the outside and the dots follow the thin stroke, so the dots reach into the
        // bar that opens.
        expect(partsOf(leading)).toEqual(["thick", "thin", "dots"]);
        expect(viewer.style.getPropertyValue("--staff-note-clearance")).toBe("0px");

        // The barline reaches into the bar, so the notes keep the room the last note of the bar (a sixteenth in
        // this fixture, which leaves 96.875 % of the bar) leaves before the barline at the other end, less the
        // half grid step the first notehead reaches left of its anchor.
        const room = viewer.style.getPropertyValue("--staff-opening-barline-room");
        expect(room).toContain("max(calc(var(--barline-repeat-width) + var(--staff-repeat-dot-gap)),");
        expect(room).toContain("96.875%");
        expect(room).toContain("- calc(3.125% - var(--glyph-ink-width-noteheadblack))");
        expect(viewer.style.getPropertyValue("--staff-closing-barline-room")).toBe("0px");
    });

    it("keeps the notes of the next bar clear of the half of a barline that straddles the boundary", () => {
        const viewer = renderBarline(2, { 1: { end: true }, 2: { start: true } });

        // The barline stands centred on the boundary, so its inner half reaches into this bar.
        expect(viewer.style.getPropertyValue("--staff-opening-barline-room"))
            .toContain("var(--barline-repeat-both-width)");
    });

    it("leaves the room a repeat barline takes to the rest a bar holds", () => {
        // A rest stands centred in its slot and keeps that room by itself, so a bar of rests is not shifted.
        const viewer = renderBarline(1, { 1: { start: true, end: true } }, false,
            [event(fraction(0, 1), fraction(1, 1))]);

        expect(viewer.style.getPropertyValue("--staff-opening-barline-room")).toBe("0px");
        expect(viewer.style.getPropertyValue("--staff-closing-barline-room")).toBe("0px");
    });

    it("draws one barline for a repeat that closes where the next one opens", () => {
        const viewer = renderBarline(1, { 1: { end: true }, 2: { start: true } });
        const barline = viewer.querySelector(".staff-note-viewer-barline")!;

        // The ink straddles the boundary, so the dots of both repeats hang on the strokes in the middle.
        expect(partsOf(barline)).toEqual(["dots", "thin", "thick", "thin", "dots"]);
        expect(barline.classList.contains("staff-note-viewer-barline-centred")).toBe(true);

        // Its inner half reaches into the bar, so the bar keeps the room of that ink free of notes.
        expect(viewer.style.getPropertyValue("--staff-closing-barline-room"))
            .toContain("var(--barline-repeat-both-width)");
    });
});

describe("StaffNoteViewer printed markings", { concurrent: false }, () => {
    let renderResult: RenderResult | null;

    afterEach(() => {
        renderResult?.unmount();
        cleanup();
        renderResult = null;
    });

    /**
     * @param articulations The markings to draw, or undefined for none.
     *
     * @returns The rendered viewer.
     */
    const renderWithMarkings = (articulations?: IRangeArticulation[]): RenderResult => {
        const measure = buildMeasure([event(fraction(0, 1), fraction(1, 1), "1")], []);

        return render(
            <StaffNoteViewer
                isLastBar={true}
                timeSignature="4/4"
                scoreMetrics={scoreMetrics}
                baseSteps={16}
                measure={measure}
                barNumber={1}
                trackId={100}
                articulations={articulations}
            />,
        );
    };

    it("draws a hairpin and an f when markings are given", () => {
        const hairpin: IHairpin = {
            id: 1,
            trackId: 100,
            kind: RangeArticulationKind.Crescendo,
            from: { bar: 1, start: fraction(0, 1) },
            to: { bar: 1, start: fraction(1, 2) },
        };
        const forte: IForteMark = {
            id: 2,
            trackId: 100,
            kind: RangeArticulationKind.Forte,
            at: { bar: 1, start: fraction(3, 4) },
        };

        renderResult = renderWithMarkings([hairpin, forte]);

        expect(renderResult.container.querySelectorAll(".staff-note-viewer-articulation-hairpin"))
            .toHaveLength(1);
        expect(renderResult.container.querySelectorAll(".staff-note-viewer-articulation-hairpin svg path"))
            .toHaveLength(1);
        expect(renderResult.container.querySelectorAll(".staff-note-viewer-articulation-forte")).toHaveLength(1);
    });

    it("draws no marking layer without markings", () => {
        renderResult = renderWithMarkings();

        expect(renderResult.container.querySelectorAll(".staff-note-viewer-articulations")).toHaveLength(0);
    });
});
