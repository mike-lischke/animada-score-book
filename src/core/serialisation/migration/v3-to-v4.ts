/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { INoteArticulation } from "../../ScoreBookDataModel.js";
import type {
    IArrangementSnapshot, IFraction, IMeasureEvent, ITrackMeasureSnapshot, ISubdivision
} from "../../types/general.js";
import { addFractions, compareFractions, reduceFraction } from "../numeric-functions.js";
import { arrangementSnapshotVersion } from "../snapshots.js";
import type {
    ILegacyArrangementSnapshotV3, ILegacyMeasureSnapshot, ILegacySubdivision
} from "./legacy-snapshot-types.js";

/** A flat event produced by expanding steps and subdivisions. */
interface ISerializedEvent {
    start: IFraction;
    duration: IFraction;
    noteStyleId?: string;
    articulation?: INoteArticulation;
}

/** A subdivision record captured during expansion, before rest absorption shifts indices. */
interface ISubdivisionRecord {
    firstSerializedIndex: number;
    leafCount: number;
    actual: number;
    normal: number;
    isTuplet: boolean;
}

/**
 * Migrates a pre-v4 arrangement snapshot (steps + subdivisions) to the current event-based
 * schema. The conversion is faithful to the old playback model: each note absorbs the
 * following grid rests up to the next note/subdivision rest or the pulse boundary, and the
 * gaps between notes become explicit rest events.
 *
 * @param snapshot The v2/v3 snapshot to migrate.
 *
 * @returns The snapshot at the current schema version.
 */
export const migrateV3ToV4 = (snapshot: ILegacyArrangementSnapshotV3): IArrangementSnapshot => {
    const pulse = snapshot.timeParams.pulse;

    return {
        version: arrangementSnapshotVersion,
        title: snapshot.title,
        timeParams: { ...snapshot.timeParams },
        tracks: snapshot.tracks.map((track) => {
            return {
                id: track.id,
                instrumentId: track.instrumentId,
                measures: track.measures.map((measure) => {
                    return convertMeasureToV4(measure, pulse);
                }),
            };
        }),
        scoreId: snapshot.scoreId,
        measureLabels: snapshot.measureLabels ? { ...snapshot.measureLabels } : undefined,
    };
};

const convertMeasureToV4 = (measure: ILegacyMeasureSnapshot, pulse: string): ITrackMeasureSnapshot => {
    const { events: serialized, subdivisions: subdivisionRecords } = expandMeasure(measure);
    const pulseFraction = parsePulse(pulse);
    const measureEnd: IFraction = { numerator: 1, denominator: 1 };
    const stepResolution = measure.meter.stepResolution;

    const isGridRest = (event: ISerializedEvent): boolean => {
        return event.noteStyleId === undefined
            && event.duration.numerator * stepResolution === event.duration.denominator;
    };

    // Start of the next note or subdivision rest after the given index (grid rests do not stop absorption).
    const nextStopperStart = (serializedIndex: number): IFraction => {
        for (let k = serializedIndex + 1; k < serialized.length; k++) {
            if (!isGridRest(serialized[k])) {
                return serialized[k].start;
            }
        }

        return measureEnd;
    };

    const pulseBoundaryAfter = (start: IFraction): IFraction => {
        const startInPulses = (start.numerator * pulseFraction.denominator)
            / (start.denominator * pulseFraction.numerator);
        const nextK = Math.floor(startInPulses) + 1;
        const candidate = reduceFraction(nextK * pulseFraction.numerator, pulseFraction.denominator);

        return compareFractions(candidate, measureEnd) < 0 ? candidate : measureEnd;
    };

    const final: IMeasureEvent[] = [];
    const serializedToFinal = new Map<number, number>();

    const subdivisionLeafIndices = new Set<number>();
    for (const record of subdivisionRecords) {
        for (let leaf = 0; leaf < record.leafCount; leaf++) {
            subdivisionLeafIndices.add(record.firstSerializedIndex + leaf);
        }
    }

    const pushRest = (start: IFraction, duration: IFraction): void => {
        const last = final.at(-1);
        const isGrid = duration.numerator * stepResolution === duration.denominator;
        const isGridAligned = (fraction: IFraction): boolean => {
            return (fraction.numerator * stepResolution) % fraction.denominator === 0;
        };

        const lastIsGridRest = last !== undefined && last.noteStyleId === undefined
            && isGridAligned(last.start)
            && (last.duration.numerator * stepResolution) % last.duration.denominator === 0;

        if (isGrid && lastIsGridRest) {
            last.duration = addFractions(last.duration, duration);

            return;
        }

        final.push({ start: { ...start }, duration: { ...duration } });
    };

    let i = 0;

    while (i < serialized.length) {
        const event = serialized[i];

        if (event.noteStyleId === undefined) {
            pushRest(event.start, event.duration);
            serializedToFinal.set(i, final.length - 1);
            i++;

            continue;
        }

        if (subdivisionLeafIndices.has(i)) {
            // Subdivision notes must not absorb following grid rests: they already fill their
            // subdivision slot, so extending them would overflow the subdivision's cell span.
            final.push({
                start: { ...event.start },
                duration: { ...event.duration },
                noteStyleId: event.noteStyleId,
                articulation: event.articulation ? { ...event.articulation } : undefined,
            });
            serializedToFinal.set(i, final.length - 1);
            i++;

            continue;
        }

        const pulseEnd = pulseBoundaryAfter(event.start);
        const stopperStart = nextStopperStart(i);
        const limit = compareFractions(stopperStart, pulseEnd) < 0 ? stopperStart : pulseEnd;

        let duration = event.duration;
        let j = i + 1;

        while (j < serialized.length && isGridRest(serialized[j]) && compareFractions(serialized[j].start, limit) < 0) {
            duration = addFractions(duration, serialized[j].duration);
            j++;
        }

        final.push({
            start: { ...event.start },
            duration,
            noteStyleId: event.noteStyleId,
            articulation: event.articulation ? { ...event.articulation } : undefined,
        });
        serializedToFinal.set(i, final.length - 1);

        i = j;
    }

    const subdivisions: ISubdivision[] = subdivisionRecords.map((record) => {
        return {
            startIndex: serializedToFinal.get(record.firstSerializedIndex) ?? 0,
            actual: record.actual,
            normal: record.normal,
            isTuplet: record.isTuplet,
        };
    });

    return {
        number: measure.number,
        meter: { ...measure.meter },
        events: final,
        subdivisions,
    };
};

/**
 * Expands a measure's steps and subdivisions into a flat, contiguous event stream. Every step
 * becomes one event; subdivisions are expanded into their constituent sub-notes and captured as
 * subdivision records (tuplet or symmetric split).
 *
 * @param measure The pre-v4 measure to expand.
 *
 * @returns The flat event stream and the captured subdivision records.
 */
const expandMeasure = (measure: ILegacyMeasureSnapshot): {
    events: ISerializedEvent[]; subdivisions: ISubdivisionRecord[];
} => {
    const stepsPerBar = measure.meter.stepResolution;
    const steps = [...measure.steps].sort((left, right) => {
        return left.index - right.index;
    });
    const stepData = steps.map((step) => {
        return { noteStyleId: step.noteStyleId, articulation: step.articulation };
    });

    const subdivisions = measure.subdivisions;
    const topLevelSubdivisions = [...subdivisions]
        .filter((sub) => {
            return sub.parentSubdivisionId == null;
        })
        .sort((left, right) => {
            return left.startStep - right.startStep;
        });

    const subdivisionsById = new Map(subdivisions.map((sub) => {
        return [sub.id, sub] as const;
    }));

    const childrenByParentId = new Map<number, Map<number, ILegacySubdivision>>();
    for (const sub of subdivisions) {
        if (sub.parentSubdivisionId == null) {
            continue;
        }

        const parent = subdivisionsById.get(sub.parentSubdivisionId);
        if (parent == null) {
            continue;
        }

        const relativeSlot = sub.startStep - parent.startStep;
        let slotMap = childrenByParentId.get(sub.parentSubdivisionId);
        if (!slotMap) {
            slotMap = new Map();
            childrenByParentId.set(sub.parentSubdivisionId, slotMap);
        }

        slotMap.set(relativeSlot, sub);
    }

    const totalVisibleSteps = (sub: ILegacySubdivision): number => {
        const children = childrenByParentId.get(sub.id);
        if (!children || children.size === 0) {
            return sub.actual;
        }

        let size = sub.actual;
        for (const child of children.values()) {
            size = size - child.normal + totalVisibleSteps(child);
        }

        return size;
    };

    const topLevelByAbsStep = new Map(topLevelSubdivisions.map((sub) => {
        return [sub.startStep, sub] as const;
    }));

    const subdivisionsByBaseStep = new Map<number, ILegacySubdivision>();
    {
        let absIdx = 0;

        for (let baseStep = 0; baseStep < stepsPerBar;) {
            const sub = topLevelByAbsStep.get(absIdx);

            if (sub) {
                subdivisionsByBaseStep.set(baseStep, sub);
                absIdx += totalVisibleSteps(sub);
                baseStep += sub.normal;
            } else {
                absIdx++;
                baseStep++;
            }
        }
    }

    const events: ISerializedEvent[] = [];
    const records: ISubdivisionRecord[] = [];
    let visibleStepIndex = 0;

    const expandSubdivision = (sub: ILegacySubdivision, eventStart: IFraction,
        parentNoteDuration: IFraction): void => {
        const noteDuration = reduceFraction(
            sub.normal * parentNoteDuration.numerator,
            parentNoteDuration.denominator * sub.actual,
        );

        records.push({
            firstSerializedIndex: events.length,
            leafCount: totalVisibleSteps(sub),
            actual: sub.actual,
            normal: sub.normal,
            isTuplet: sub.isTuplet,
        });

        const children = childrenByParentId.get(sub.id);
        let slotStart = eventStart;
        let noteIndex = 0;

        while (noteIndex < sub.actual) {
            const child = children?.get(noteIndex);
            if (child) {
                expandSubdivision(child, slotStart, noteDuration);
                slotStart = addFractions(
                    slotStart,
                    reduceFraction(noteDuration.numerator * child.normal, noteDuration.denominator),
                );
                noteIndex += child.normal;
            } else {
                const data = stepData.at(visibleStepIndex);
                events.push({
                    start: slotStart,
                    duration: noteDuration,
                    noteStyleId: data?.noteStyleId,
                    articulation: data?.articulation ? { ...data.articulation } : undefined,
                });
                slotStart = addFractions(slotStart, noteDuration);
                visibleStepIndex += 1;
                noteIndex += 1;
            }
        }
    };

    let baseStep = 0;

    while (baseStep < stepsPerBar) {
        const sub = subdivisionsByBaseStep.get(baseStep);
        if (!sub) {
            const data = stepData.at(visibleStepIndex);
            events.push({
                start: reduceFraction(baseStep, stepsPerBar),
                duration: reduceFraction(1, stepsPerBar),
                noteStyleId: data?.noteStyleId,
                articulation: data?.articulation ? { ...data.articulation } : undefined,
            });
            baseStep += 1;
            visibleStepIndex += 1;

            continue;
        }

        expandSubdivision(sub, reduceFraction(baseStep, stepsPerBar), reduceFraction(1, stepsPerBar));
        baseStep += sub.normal;
    }

    return { events, subdivisions: records };
};

const parsePulse = (pulse: string): IFraction => {
    const [numerator, denominator] = pulse.split("/").map(Number);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
        return { numerator: 1, denominator: 4 };
    }

    return reduceFraction(numerator, denominator);
};
