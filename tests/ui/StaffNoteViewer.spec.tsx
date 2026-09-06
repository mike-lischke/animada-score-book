/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";

import { StaffNoteViewer } from "../../src/components/ui/Note/StaffNoteViewer.js";
import {
    ExcitationMode, NoteDisplayType, SbDmEntityType, type ISbDmNoteEvent, type ISbDmTrack,
    type ISbDmTrackMeasure,
} from "../../src/core/ScoreBookDataModel.js";
import type { IAudioData, IFraction, IMeasureEvent, ISubdivision } from "../../src/core/types/general.js";
import type { IScoreMetrics } from "../../src/player/TimeCoordinator.js";
import { ScoreElementKind, ScoreElementRegistry } from "../../src/ui/ScoreElementRegistry.js";

const fraction = (numerator: number, denominator: number): IFraction => {
    return { numerator, denominator };
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
 *
 * @returns The measure with resolved note events.
 */
const buildMeasure = (events: IMeasureEvent[], subdivisions: ISubdivision[]): ISbDmTrackMeasure => {
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
            mainDisplayType: NoteDisplayType.Oval,
            stickTechnique: undefined,
        },
        sampleProfile: {
            builtInDamping: 0,
            builtInAccent: false,
            ghost: false,
        },
    } as unknown as IAudioData;

    const track = { id: 100 } as ISbDmTrack;
    const noteEvents: ISbDmNoteEvent[] = events.map((measureEvent, index) => {
        return {
            type: SbDmEntityType.NoteEvent,
            id: (100 * 1_000_000) + (1 * 1_000) + index,
            measureNumber: 1,
            start: { ...measureEvent.start },
            duration: { ...measureEvent.duration },
            track,
            timing: { bar: 1, step: 0 },
            audioData: measureEvent.noteStyleId !== undefined ? audioData : undefined,
        };
    });

    return {
        type: SbDmEntityType.TrackMeasure,
        id: 13,
        number: 1,
        meter: {
            beats: 4,
            beatUnits: 4,
            stepResolution: 16,
            beatGroups: [4, 4, 4, 4],
        },
        events,
        subdivisions,
        noteEvents,
    };
};

/**
 * Builds the nested 3:8 → 2:1 → 2:1 subdivision from the grid-editing feature.
 * Bar 1 (4/4, 16 steps): eight sixteenths followed by a half-bar 3:8 tuplet whose
 * second slot is a 2:1 duplet with a nested 2:1 duplet in its first slot.
 *
 * @returns The measure with resolved note events.
 */
const buildNestedMeasure = (): ISbDmTrackMeasure => {
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
    beatsPerBar: 4,
    beatUnit: 4,
    pulsesPerBar: 4,
    stepsPerBar: 16,
    beatGroups: [4, 4, 4, 4],
    stepsPerPulse: 4,
};

describe.sequential("StaffNoteViewer beams", () => {
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

        expect(beamWidths[3]).toEqual(["12px", "12px"]);
        expect(beamWidths[7]).toEqual(["12px", "12px"]);

        // The 3:8 slots (events 8 and 12) are eighths; the outer 2:1 slot (event 11) is a
        // sixteenth and the inner 2:1 slots (events 9 and 10) are thirty-seconds. The tuplet
        // group is beamed as one run whose outer beam spans all five notes.
        expect(beamWidths[8]).toEqual(["100%"]);
        expect(beamWidths[9]).toEqual(["100%", "100%", "100%"]);
        expect(beamWidths[10]).toEqual(["100%", "100%", "12px"]);
        expect(beamWidths[11]).toEqual(["100%", "12px"]);
        expect(beamWidths[12]).toEqual(["12px"]);
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
            { left: "var(--note-anchor)", width: "100%" },
            { left: "var(--note-anchor)", width: "12px" },
        ]);
        expect(beams[1]).toEqual([
            { left: "var(--note-anchor)", width: "100%" },
        ]);
        expect(beams[2]).toEqual([
            { left: "calc(var(--note-anchor) - 12px)", width: "12px" },
            { left: "calc(var(--note-anchor) - 12px)", width: "12px" },
        ]);
    });

    it("merges two eighth rests in one pulse into a quarter rest", () => {
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
        expect(runs).toHaveLength(2);

        const restRuns = runs.filter((run) => {
            return !run.classList.contains("staff-note-viewer-note-run");
        });
        expect(restRuns).toHaveLength(1);

        // The merged rest spans one pulse, so its slot anchor halves from an eighth's 25% to 12.5%.
        expect(restRuns[0].getAttribute("style")).toContain("--note-anchor: 12.5%");
    });

    it("registers the whole-measure rest as a staff run", () => {
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
        expect(registry.getLocation(runs[0])).toEqual({
            kind: ScoreElementKind.StaffRun,
            bar: 1,
            trackId: 100,
            step: 0,
            start: { numerator: 0, denominator: 1 },
        });
    });
});
