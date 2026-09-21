/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";

import { StaffNoteViewer } from "../../src/components/ui/Note/StaffNoteViewer.js";
import {
    Damping, ExcitationMode, HandTechnique, NoteDisplayType, SbDmEntityType, type ISbDmNoteEvent, type ISbDmTrack,
    type ISbDmTrackMeasure, type ISampleProfile,
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
 * @param sampleProfile Optional articulation profile for the resolved note style.
 * @param handTechnique Optional hand technique for the resolved note style.
 *
 * @returns The measure with resolved note events.
 */
const buildMeasure = (events: IMeasureEvent[], subdivisions: ISubdivision[],
    sampleProfile: ISampleProfile = { builtInDamping: Damping.Open, builtInAccent: false, ghost: false },
    handTechnique?: HandTechnique,
): ISbDmTrackMeasure => {
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
            handTechnique,
        },
        sampleProfile,
    } as unknown as IAudioData;

    const track = { id: 100 } as ISbDmTrack;
    const measure: ISbDmTrackMeasure = {
        type: SbDmEntityType.TrackMeasure,
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

/**
 * Builds the measure of the reported case: fifteen sixteenths, then a thirty-second rest and a
 * thirty-second note at the very end of the bar.
 *
 * @returns The measure with resolved note events.
 */
const buildFullBarEndingInThirtySecond = (): ISbDmTrackMeasure => {
    const events = [
        ...Array.from({ length: 15 }, (_, index) => {
            return event(fraction(index, 16), fraction(1, 16), "1");
        }),
        event(fraction(15, 16), fraction(1, 32)),
        event(fraction(31, 32), fraction(1, 32), "1"),
    ];

    return buildMeasure(events, []);
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
        expect(beams[1]).toEqual(["12px", "12px", "12px"]);
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

        const head = renderResult.container.querySelector(".staff-note-head");
        expect(head?.classList.contains("ghost-note")).toBe(true);
        expect(renderResult.container.querySelector(".staff-note-head-ghost-paren")).not.toBeNull();
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

        expect(renderResult.container.querySelector(".staff-note-viewer-accent")).not.toBeNull();
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
        // instead and keeps the width of its flags free there.
        expect(runs[16].getAttribute("style")).toContain("--note-anchor: calc(100% - 11px)");

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

        // The final barline is drawn inside the bar, so the note keeps clear of it as well.
        expect(runs[16].getAttribute("style")).toContain("--note-anchor: calc(100% - 17px)");
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
        const restSymbol = renderResult.container.querySelector(".staff-note-viewer-rest-symbol");
        expect(restSymbol?.getAttribute("style")).toContain("--rest-show-eighth: inline");
    });
});
