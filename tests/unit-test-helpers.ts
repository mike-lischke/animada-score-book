/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Arrangement } from "../src/core/Arrangement.js";
import { modelEventAt } from "../src/core/MeasureProjection.js";
import {
    SbDmEntityType, type ISbDmInstrument, type ISbDmTrack, type ISbDmTrackMeasure, type ScoreBookDataModel,
} from "../src/core/ScoreBookDataModel.js";
import { addFractions, reduceFraction } from "../src/core/serialisation/numeric-functions.js";
import type { IFraction, IMeasureEvent, ITrackSnapshot } from "../src/core/types/general.js";
import { SelectionGranularity, SelectionSerializer, type ISelectionEntry }
    from "../src/ui/SelectionSerializer.js";
import { TimeCoordinator } from "../src/player/TimeCoordinator.js";
import { TrackPlayer } from "../src/player/TrackPlayer.js";

/**
 * Creates a note selection entry addressing one grid cell of a measure. A cell covers one step,
 * shortened at the end of the event a subdivision slot belongs to — the shape the grid hit test
 * produces.
 *
 * @param measure The measure the position belongs to.
 * @param start The exact start within the measure.
 *
 * @returns The selection entry addressing that cell.
 */
export const noteEntry = (measure: ISbDmTrackMeasure, start: IFraction): ISelectionEntry => {
    const event = modelEventAt(measure, start)!;

    return {
        granularity: SelectionGranularity.Note,
        target: {
            granularity: SelectionGranularity.Note,
            measure,
            event,
            start: { ...start },
            end: SelectionSerializer.spanEnd(event, start, measure),
        },
    };
};

/**
 * Creates a note selection entry addressing the whole run of an event, as the staff view selects it:
 * a run keeps the event's full duration, so a copy is not cut at a cell boundary.
 *
 * @param measure The measure the event belongs to.
 * @param event The event the run renders.
 *
 * @returns The selection entry addressing that run.
 */
export const runEntry = (measure: ISbDmTrackMeasure, event: IMeasureEvent): ISelectionEntry => {
    return {
        granularity: SelectionGranularity.Note,
        target: {
            granularity: SelectionGranularity.Note,
            measure,
            event,
            start: { ...event.start },
            end: addFractions(event.start, event.duration),
        },
    };
};

/**
 * Creates a note group selection entry addressing the given events of a measure.
 *
 * @param measure The measure the events belong to.
 * @param events The events of the group.
 *
 * @returns The selection entry addressing the group.
 */
export const noteGroupEntry = (measure: ISbDmTrackMeasure, events: IMeasureEvent[]): ISelectionEntry => {
    return {
        granularity: SelectionGranularity.NoteGroup,
        target: { granularity: SelectionGranularity.NoteGroup, measure, events },
    };
};

/**
 * Returns the events of a measure whose start lands on a step inside the given inclusive range.
 *
 * @param measure The measure to scan.
 * @param startStep The first step of the range.
 * @param endStep The last step of the range.
 *
 * @returns The events of the range, in measure order.
 */
export const eventsInSteps = (measure: ISbDmTrackMeasure, startStep: number, endStep: number): IMeasureEvent[] => {
    const stepsPerBar = measure.meter.stepResolution;

    return measure.events.filter((event) => {
        const step = event.start.numerator * stepsPerBar / event.start.denominator;

        return Number.isInteger(step) && step >= startStep && step <= endStep;
    });
};

/**
 * Creates a note group selection entry covering the events that start in the given step range.
 *
 * @param measure The measure the events belong to.
 * @param startStep The first step of the range.
 * @param endStep The last step of the range.
 *
 * @returns The selection entry addressing the group.
 */
export const noteGroupInSteps = (measure: ISbDmTrackMeasure, startStep: number,
    endStep: number): ISelectionEntry => {
    return noteGroupEntry(measure, eventsInSteps(measure, startStep, endStep));
};

/**
 * Creates a track piece selection entry addressing one track within one measure.
 *
 * @param track The track the piece belongs to.
 * @param measure The measure of the piece.
 *
 * @returns The selection entry addressing the track piece.
 */
export const trackPieceEntry = (track: ISbDmTrack, measure: ISbDmTrackMeasure): ISelectionEntry => {
    return {
        granularity: SelectionGranularity.TrackPiece,
        target: { granularity: SelectionGranularity.TrackPiece, track, measure },
    };
};

/**
 * Creates a measure selection entry. A measure-level selection addresses a bar, which spans all
 * tracks, so any track's measure of that bar stands in for it.
 *
 * @param measure The reference measure of the bar.
 *
 * @returns The selection entry addressing the bar.
 */
export const measureEntry = (measure: ISbDmTrackMeasure): ISelectionEntry => {
    return {
        granularity: SelectionGranularity.Measure,
        target: { granularity: SelectionGranularity.Measure, measure },
    };
};

/**
 * Creates a track selection entry addressing all measures of a track.
 *
 * @param track The selected track.
 *
 * @returns The selection entry addressing the track.
 */
export const trackEntry = (track: ISbDmTrack): ISelectionEntry => {
    return {
        granularity: SelectionGranularity.Track,
        target: { granularity: SelectionGranularity.Track, track },
    };
};

/**
 * Places a note style in one grid cell, so fixtures can fill a measure cell by cell. Grid cells are
 * not part of the model API — a cell is a position plus the duration of one step.
 *
 * @param dataModel The model holding the measure.
 * @param trackId The track containing the measure.
 * @param bar The one-based measure number.
 * @param step The zero-based step to write.
 * @param noteStyleId The note style to place, or undefined to clear the cell.
 *
 * @returns True when the measure changed.
 */
export const setCellNote = (dataModel: ScoreBookDataModel, trackId: number, bar: number, step: number,
    noteStyleId?: string): boolean => {
    const measure = dataModel.arrangement?.tracks.find((track) => {
        return track.id === trackId;
    })?.measures[bar - 1];
    if (measure === undefined) {
        return false;
    }

    const stepsPerBar = measure.meter.stepResolution;

    return dataModel.setNoteAt(trackId, bar, reduceFraction(step, stepsPerBar),
        reduceFraction(1, stepsPerBar), noteStyleId);
};

/**
 * Creates a minimal instrument for tests.
 *
 * @param typeId The instrument type id.
 * @param id The numeric instrument id.
 * @param displayOrder The display order; defaults to the id.
 *
 * @returns A fully constructed instrument.
 */
export const createInstrument = (typeId: string, id: number, displayOrder = id): ISbDmInstrument => {
    return {
        type: SbDmEntityType.Instrument,
        id,
        typeId,
        displayOrder,
        displayName: `Instrument ${typeId}`,
        image: { type: SbDmEntityType.InstrumentImage, id: id + 1000, filePath: "" },
        color: "",
        range: [0, 0],
        state: {
            initialized: true,
            isLeaf: true,
            expanded: false,
            expandedOnce: false,
        },
        noteStyles: {},
    };
};

/**
 * Materializes measure events for every track by running the tracks through a `TrackPlayer`.
 *
 * @param arrangement The arrangement whose tracks should be hydrated.
 */
export const hydrateMeasureEvents = (arrangement: Arrangement): void => {
    const timeCoordinator = new TimeCoordinator(arrangement.timeParams, {
        state: "stopped",
        get currentTime() {
            return -1;
        },
    });

    const players = arrangement.tracks.map((track) => {
        return new TrackPlayer(track, timeCoordinator);
    });

    players.forEach((player) => {
        player.dispose();
    });
};

/**
 * Builds a minimal track snapshot with a single empty measure.
 *
 * @param id The track id.
 * @param instrumentId The instrument type id.
 * @param stepsPerBar Steps per bar for the measure; defaults to 16.
 *
 * @returns A minimal track snapshot.
 */
export const emptyMeasureTrack = (id: number, instrumentId: string, stepsPerBar = 16): ITrackSnapshot => {
    return {
        id,
        instrumentId,
        measures: [{
            number: 1,
            meter: {
                beats: stepsPerBar,
                beatUnits: 4,
                stepResolution: stepsPerBar,
                beatGroups: Array.from({ length: stepsPerBar }, () => {
                    return 1;
                }),
            },
            events: [{
                start: { numerator: 0, denominator: 1 },
                duration: { numerator: 1, denominator: 1 },
            }],
            subdivisions: [],
        }],
    };
};
