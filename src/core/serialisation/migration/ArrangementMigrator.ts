/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { PlayerPlayState } from "../../../player/ArrangementPlayer.js";
import { TimeCoordinator, type IScoreMetrics } from "../../../player/TimeCoordinator.js";
import type { IRealtimeProvider } from "../../../ui/AnimationEngine.js";
import { Arrangement } from "../../Arrangement.js";
import { type ISbDmInstrument } from "../../ScoreBookDataModel.js";
import { TimeParams } from "../../TimeParams.js";
import type {
    IArrangementSnapshot, IMeasureStep, ISubdivision, ITrackMeasureSnapshot, ITrackSnapshot
} from "../../types/general.js";
import { primeFactors } from "../../utils.js";
import { tryParsePackedArrangement } from "../snapshot-packing.js";
import { arrangementSnapshotVersion } from "../snapshots.js";
import { BananaDrumUrlImporter, LegacyArrangement, LegacyNote, LegacyTrack } from "./BananaDrumUrlImporter.js";
import type {
    ILegacyArrangementSnapshot, ILegacyTrackSnapshot
} from "./legacy-snapshot-types.js";

/** Returned by {@link ArrangementMigrator.migrateToArrangement}. */
export interface IMigrationResult {
    /** The arrangement at the current schema version. */
    arrangement: Arrangement;
    /** Whether a schema migration was performed. */
    migrated: boolean;
}

export class ArrangementMigrator {
    /**
     * Migrates any supported input format to a live {@link Arrangement} at the
     * current schema version.
     *
     * This is the single entry point for loading arrangements — all source
     * types flow through this method.
     *
     * @param source      An arrangement snapshot, legacy URL params, or a raw
     *                    score-content string.
     * @param instruments The available instruments.
     *
     * @returns The migrated arrangement together with a flag indicating whether
     *          a schema migration was performed.
     */
    public static migrateToArrangement(
        source: IArrangementSnapshot | ILegacyArrangementSnapshot | URLSearchParams | string,
        instruments: ISbDmInstrument[]): IMigrationResult {
        if (typeof source === "string") {
            const compact = tryParsePackedArrangement(source);
            if (compact) {
                return { arrangement: this.migrate(compact, instruments), migrated: false };
            }

            const params = new URLSearchParams(source);
            const legacyArrangement = BananaDrumUrlImporter.getArrangementFromParams(params, instruments);
            if (!legacyArrangement) {
                throw new Error("Score content could not be decoded");
            }

            return { arrangement: this.migrateLegacyArrangement(legacyArrangement, instruments), migrated: true };
        }

        if (source instanceof URLSearchParams) {
            const legacyArrangement = BananaDrumUrlImporter.getArrangementFromParams(source, instruments);
            if (!legacyArrangement) {
                throw new Error("URL does not contain a recognised score payload");
            }

            return { arrangement: this.migrateLegacyArrangement(legacyArrangement, instruments), migrated: true };
        }

        const migrated = source.version < arrangementSnapshotVersion;

        return { arrangement: this.migrate(source, instruments), migrated };
    }

    private static migrate(snapshot: IArrangementSnapshot | ILegacyArrangementSnapshot,
        instruments: ISbDmInstrument[]): Arrangement {
        if (snapshot.version < arrangementSnapshotVersion) {
            const legacyArrangement = new LegacyArrangement(snapshot as ILegacyArrangementSnapshot);

            return this.migrateLegacyArrangement(legacyArrangement, instruments);
        }

        if (snapshot.version > arrangementSnapshotVersion) {
            throw new Error(`Unsupported snapshot schema version: ${snapshot.version}`);
        }

        return this.createArrangementFromSnapshot(snapshot as IArrangementSnapshot, instruments);
    }

    /**
     * Builds a current-schema {@link Arrangement} directly from the fields of a {@link LegacyArrangement}.
     * No intermediate snapshot is involved — the legacy tracks (with their pre-built notes and polyrhythms)
     * are converted measure-by-measure into the current schema structure.
     *
     * @param legacyArrangement The fully constructed legacy arrangement.
     * @param instruments The available instruments.
     *
     * @returns A live arrangement at the current schema version.
     */
    private static migrateLegacyArrangement(legacyArrangement: LegacyArrangement,
        instruments: ISbDmInstrument[]): Arrangement {
        const realtimeProvider: IRealtimeProvider = {
            get state(): PlayerPlayState {
                return "stopped";
            },
            get currentTime() {
                return 0;
            },
        };

        const timeCoordinator = new TimeCoordinator(
            {
                timeSignature: legacyArrangement.timeParams.timeSignature,
                tempo: legacyArrangement.timeParams.tempo,
                length: legacyArrangement.timeParams.length,
                pulse: legacyArrangement.timeParams.pulse,
                stepResolution: legacyArrangement.timeParams.stepResolution,
            },
            realtimeProvider,
        );
        const metrics = timeCoordinator.metrics;
        const meterBase = ArrangementMigrator.getMeterBase(metrics.beatsPerBar, metrics.beatUnit);

        const snapshot: IArrangementSnapshot = {
            version: 2,
            title: legacyArrangement.title,
            timeParams: {
                timeSignature: legacyArrangement.timeParams.timeSignature,
                tempo: legacyArrangement.timeParams.tempo,
                length: legacyArrangement.timeParams.length,
                pulse: legacyArrangement.timeParams.pulse,
                stepResolution: legacyArrangement.timeParams.stepResolution,
            },
            tracks: legacyArrangement.tracks.map((legacyTrack, trackIndex) => {
                return this.migrateLegacyTrack(
                    legacyTrack,
                    legacyArrangement.snapshot.tracks[trackIndex],
                    metrics,
                    meterBase,
                );
            }),
        };

        return this.createArrangementFromSnapshot(snapshot, instruments);
    }

    private static createArrangementFromSnapshot(snapshot: IArrangementSnapshot,
        instruments: ISbDmInstrument[]): Arrangement {
        const tps = snapshot.timeParams;
        const timeParams = new TimeParams(
            tps.timeSignature, tps.tempo, tps.length, tps.pulse, tps.stepResolution,
        );

        const arrangement = new Arrangement();
        arrangement.timeParams = timeParams;
        arrangement.applyArrangementSnapshot(snapshot, instruments);

        return arrangement;
    }

    private static migrateLegacyTrack(legacyTrack: LegacyTrack, source: ILegacyTrackSnapshot,
        metrics: IScoreMetrics, meterBase: Set<number>): ITrackSnapshot {
        const measures: ITrackMeasureSnapshot[] = [];
        const stepsPerBar = metrics.stepsPerBar;

        const visibleNotes: LegacyNote[] = [];
        for (const note of legacyTrack.getNoteIterator()) {
            visibleNotes.push(note);
        }

        let noteCursor = 0;
        for (let measureNumber = 0; measureNumber < metrics.bars; measureNumber++) {
            const subdivisions = this.collectMeasureSubdivisions(visibleNotes, noteCursor, measureNumber,
                stepsPerBar);
            const visibleCount = this.countMeasureVisibleSteps(visibleNotes, noteCursor, measureNumber, stepsPerBar);

            ArrangementMigrator.computeIsTupletWithNesting(subdivisions, meterBase);

            const steps: IMeasureStep[] = [];
            for (let j = 0; j < visibleCount; j++) {
                const note = visibleNotes[noteCursor + j];
                steps.push({
                    index: j,
                    noteStyleId: note.noteStyle ?? undefined,
                });
            }

            noteCursor += visibleCount;

            measures.push({
                number: measureNumber + 1,
                meter: {
                    beats: metrics.beatsPerBar,
                    beatUnits: metrics.beatUnit,
                    stepResolution: stepsPerBar,
                    beatGroups: ArrangementMigrator.createBeatGroups(
                        metrics.beatsPerBar, metrics.beatUnit, stepsPerBar,
                    ),
                },
                steps,
                subdivisions,
            });
        }

        return {
            id: legacyTrack.id,
            instrumentId: legacyTrack.instrumentId,
            measures,
        };
    }

    /**
     * Computes how many notes of a polyrhythm fall into a given measure.
     *
     * Both {@link prStartStep} and {@link prEndStep} are inclusive base-grid
     * positions. Distributes {@link totalActual} notes proportionally across the
     * total replaced steps so that measure boundaries get a consistent integer
     * split (floor accumulation, last overlapping measure gets the remainder).
     *
     * @param prStartStep The start step of the polyrhythm (inclusive).
     * @param prEndStep The end step of the polyrhythm (inclusive).
     * @param totalActual The total number of actual notes in the polyrhythm.
     * @param measureBaseStart The start step of the measure (inclusive).
     * @param measureBaseEnd The end step of the measure (inclusive).
     *
     * @returns The number of notes belonging to the measure, and whether any notes remain for later measures.
     */
    private static splitPolyrhythmNotes(
        prStartStep: number, prEndStep: number, totalActual: number,
        measureBaseStart: number, measureBaseEnd: number,
    ): { notesInMeasure: number; hasMore: boolean; } {
        const totalNormal = prEndStep - prStartStep + 1; // inclusive → count

        const previousNormal = Math.max(0, measureBaseStart - prStartStep);
        const previousNotes = Math.floor(totalActual * previousNormal / totalNormal);

        const overlapEnd = Math.min(prEndStep, measureBaseEnd);
        const overlapNormal = Math.max(0, overlapEnd - Math.max(prStartStep, measureBaseStart) + 1);

        const notesEnd = Math.floor(totalActual * (previousNormal + overlapNormal) / totalNormal);

        return {
            notesInMeasure: notesEnd - previousNotes,
            hasMore: prEndStep > measureBaseEnd,
        };
    }

    private static collectMeasureSubdivisions(visibleNotes: LegacyNote[], noteCursor: number,
        measureNumber: number,
        stepsPerBar: number): ISubdivision[] {
        const subdivisions: ISubdivision[] = [];
        const measureBaseStart = measureNumber * stepsPerBar;
        const measureBaseEnd = measureBaseStart + stepsPerBar - 1;
        const seenPolyrhythmIds = new Set<number>();

        let i = noteCursor;
        while (i < visibleNotes.length) {
            const note = visibleNotes[i];
            const pr = note.polyrhythm;
            if (!pr) {
                // Grid note — stop when we reach the next measure.
                const globalStep = ((note.timing.bar - 1) * stepsPerBar) + note.timing.step;
                if (globalStep >= measureBaseStart + stepsPerBar) {
                    break;
                }
                i++;
                continue;
            }

            // Only process each polyrhythm once per measure.
            if (seenPolyrhythmIds.has(pr.id)) {
                i++;
                continue;
            }

            const prStartStep = (pr.start.timing.bar * stepsPerBar) + pr.start.timing.step - stepsPerBar;
            const prEndStep = (pr.end.timing.bar * stepsPerBar) + pr.end.timing.step - stepsPerBar;

            const overlapStart = Math.max(prStartStep, measureBaseStart);
            const overlapEnd = Math.min(prEndStep, measureBaseEnd);

            if (overlapStart > overlapEnd) {
                // No overlap with this measure.
                if (prStartStep >= measureBaseStart + stepsPerBar) {
                    break;
                }
                i++;
                continue;
            }

            seenPolyrhythmIds.add(pr.id);
            const normal = overlapEnd - overlapStart + 1;

            const { notesInMeasure, hasMore } = ArrangementMigrator.splitPolyrhythmNotes(
                prStartStep, prEndStep, pr.length, measureBaseStart, measureBaseEnd,
            );

            subdivisions.push({
                id: pr.id,
                startStep: i - noteCursor,
                actual: notesInMeasure,
                normal,
                isTuplet: false,
                parentSubdivisionId: undefined, // Derived locally per measure below
            });

            if (!hasMore && notesInMeasure === 0) {
                break;
            }

            // Advance one note at a time — the polyrhythm may contain nested
            // children whose notes are interleaved.  seenPolyrhythmIds prevents
            // duplicate subdivision entries for the same polyrhythm.
            i++;
        }

        ArrangementMigrator.deriveLocalParents(subdivisions);

        return subdivisions;
    }

    /**
     * Derives parent-child relationships for subdivisions within a single
     * measure, based on their positions in the steps array.  A subdivision B
     * is a child of A when B occupies one or more of A's slots, i.e.
     * B.startStep falls within A's slot range.
     *
     * @param subdivisions The subdivisions of a single measure to update in-place.
     */
    private static deriveLocalParents(subdivisions: ISubdivision[]): void {
        if (subdivisions.length < 2) {
            return;
        }

        // Sort by startStep so smaller-range candidates are considered first.
        const sorted = [...subdivisions].sort((a, b) => {
            return a.startStep - b.startStep || (b.actual - a.actual);
        });

        for (const sub of subdivisions) {
            let parent: ISubdivision | undefined;

            for (const candidate of sorted) {
                if (candidate.id === sub.id) {
                    continue;
                }

                const relativeSlot = sub.startStep - candidate.startStep;
                if (relativeSlot > 0 && relativeSlot + sub.normal <= candidate.actual) {
                    if (!parent || candidate.actual < parent.actual) {
                        parent = candidate;
                    }
                }
            }

            sub.parentSubdivisionId = parent?.id;
        }
    }

    private static countMeasureVisibleSteps(visibleNotes: LegacyNote[], noteCursor: number, measureNumber: number,
        stepsPerBar: number): number {
        const barEnd = (measureNumber + 1) * stepsPerBar;
        let count = 0;

        for (let i = noteCursor; i < visibleNotes.length; i++) {
            const note = visibleNotes[i];
            if (!note.polyrhythm) {
                // Grid note — stop when we reach the next measure.
                const globalStep = ((note.timing.bar - 1) * stepsPerBar) + note.timing.step;
                if (globalStep >= barEnd) {
                    break;
                }
            } else {
                // Determine this individual PR note's position in the base grid
                // so cross-bar polyrhythms are split correctly across measures.
                const pr = note.polyrhythm;
                const prStartStep = (pr.start.timing.bar * stepsPerBar) + pr.start.timing.step - stepsPerBar;
                const prEndStep = (pr.end.timing.bar * stepsPerBar) + pr.end.timing.step - stepsPerBar;
                const totalNormal = prEndStep - prStartStep + 1;

                const noteIndex = pr.notes.indexOf(note);
                const pos = prStartStep + (noteIndex * totalNormal / pr.length);

                if (pos >= barEnd) {
                    break;
                }
            }
            count++;
        }

        return count;
    }

    private static getMeterBase(beatsPerBar: number, beatUnit: number): Set<number> {
        if (![2, 3, 4, 6, 9, 12].includes(beatsPerBar)) {
            return new Set<number>();
        }

        if (beatUnit >= 8 && beatsPerBar >= 6 && beatsPerBar % 3 === 0) {
            return new Set([3]);
        }

        return new Set([2]);
    }

    private static computeIsTupletWithNesting(subdivisions: ISubdivision[],
        meterBase: Set<number>): void {
        const sorted = [...subdivisions].sort((a, b) => {
            return (b.parentSubdivisionId != null ? 1 : 0) - (a.parentSubdivisionId != null ? 1 : 0);
        });

        const childrenByParent = new Map<number, ISubdivision[]>();
        for (const sub of subdivisions) {
            if (sub.parentSubdivisionId != null) {
                const list = childrenByParent.get(sub.parentSubdivisionId) ?? [];
                list.push(sub);
                childrenByParent.set(sub.parentSubdivisionId, list);
            }
        }

        for (const sub of sorted) {
            const actualFactors = primeFactors(sub.actual);
            const baseFactors = sub.normal === 1 ? meterBase : primeFactors(sub.normal);
            const selfIsTuplet = [...actualFactors].some((f) => {
                return !baseFactors.has(f);
            });

            const children = childrenByParent.get(sub.id) ?? [];
            const childIsTuplet = children.some((c) => {
                return c.isTuplet;
            });

            sub.isTuplet = selfIsTuplet || childIsTuplet;
        }
    }

    private static createBeatGroups(numerator: number, denominator: number, stepResolution: number): number[] {
        if (numerator <= 0 || denominator <= 0 || stepResolution <= 0 || denominator % 2 !== 0) {
            return [stepResolution];
        }

        switch (denominator) {
            case 4: {
                switch (numerator) {
                    case 2: case 4: case 8:
                        return Array.from({ length: numerator }, () => {
                            return stepResolution / 4;
                        });

                    case 3: case 6:
                        return Array.from({ length: numerator }, () => {
                            return stepResolution / 3;
                        });

                    case 5: case 7: {
                        const spb = stepResolution / numerator;

                        return Array.from({ length: numerator }, (_, beat) => {
                            return beat % 2 === 0 ? Math.ceil(spb) : Math.floor(spb);
                        });
                    }

                    default:
                        return [stepResolution];
                }
            }

            case 8: {
                switch (numerator) {
                    case 6: return Array.from({ length: 2 }, () => {
                        return stepResolution / 2;
                    });

                    case 7: {
                        const spb = stepResolution / numerator;

                        return Array.from({ length: numerator }, (_, beat) => {
                            return beat % 2 === 0 ? Math.ceil(spb) : Math.floor(spb);
                        });
                    }

                    case 9: return Array.from({ length: 3 }, () => {
                        return stepResolution / 3;
                    });

                    case 12: return Array.from({ length: 4 }, () => {
                        return stepResolution / 4;
                    });

                    default:
                        return [stepResolution];
                }
            }

            default:
                return [stepResolution];
        }
    }
}
