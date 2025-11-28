/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type {
    EditCommand, EditCommand_Arrangement,
    EditCommand_ArrangementTitle, EditCommand_Note, EditCommand_TimeParams,
    EditCommand_TimeParamsLength, EditCommand_TimeParamsTempo, EditCommand_TimeParamsTimeSignature,
    EditCommand_Track
} from "./types/edit_commands.js";
import type { Arrangement, Note, TimeParams, Track } from "./types/general.js";

// Single edit function for all changes to the arrangement, so that we can maintain an undo stack
// Returns a boolean indicating whether anything has changed
export const edit = (command: EditCommand): boolean => {
    switch (command.type) {
        case "EditCommand_ArrangementTitle": {
            return editArrangement(command as EditCommand_Arrangement);
        }

        case "EditCommand_TrackRemovePolyrhythm":
        case "EditCommand_TrackClear":
            return editTrack(command as EditCommand_Track);

        case "EditCommand_TimeParamsTimeSignature":
        case "EditCommand_TimeParamsTempo":
        case "EditCommand_TimeParamsLength": {
            return editTimeParams(command as EditCommand_TimeParams);
        }

        case "EditCommand_Note": {
            return editNote(command);
        }

        default:
            return false;
    }

    return false;
};

const editArrangement = (command: EditCommand_Arrangement): boolean => {
    const arrangement = command.arrangement as Arrangement;

    const newTitle = (command as EditCommand_ArrangementTitle).newTitle;
    if (typeof newTitle === "string") {
        if (arrangement.title != newTitle) {
            arrangement.title = newTitle;

            return true;
        }

        return false;
    }

    if (command.type === "EditCommand_ArrangementAddTrack") {
        arrangement.addTrack(command.addTrack);

        return true;
    }

    if (command.type === "EditCommand_ArrangementRemoveTrack") {
        try {
            // TODO: removeTrack is not derived from Track, so that cast is wrong.
            arrangement.removeTrack(command.removeTrack as Track);

            return true;
        } catch {
            return false;
        }
    }

    if (command.type === "EditCommand_ArrangementClear") {
        // Need to painstakingly check whether this changes anything
        for (const track of arrangement.tracks) {
            for (const note of track.getNoteIterator()) {
                if (note.noteStyle) {
                    // As soon as we find one note to clear, we're good
                    arrangement.tracks.forEach((track) => {
                        track.clear();
                    });

                    return true;
                }
            }
        }

        return false;
    }

    if (command.type === "EditCommand_ArrangementClearSelection") {
        let changedAnyNotes = false;

        command.clearSelection.forEach((trackSelection) => {
            trackSelection.selectedNotes.forEach((note) => {
                if (note.noteStyle) {
                    (note as Note).noteStyle = undefined;
                    changedAnyNotes = true;
                }
            });
        });

        return changedAnyNotes;
    }

    if (command.type === "EditCommand_ArrangementAddPolyrhythms") {
        command.addPolyrhythms.selection.forEach(({ range }) => {
            const [start, end] = (range as [Note, Note]);
            const track = start.track;
            track.addPolyrhythm(start, end, command.addPolyrhythms.length);
        });

        return true;
    }

    return false;
};

const editTrack = (command: EditCommand_Track): boolean => {
    const track = command.track as Track;

    if (command.type === "EditCommand_TrackRemovePolyrhythm") {
        if (track.polyrhythms.find((polyrhythm) => {
            return polyrhythm === command.removePolyrhythm;
        })) {
            track.removePolyrhythm(command.removePolyrhythm);

            return true;
        }

        return false;
    }

    for (const note of track.getNoteIterator()) {
        if (note.noteStyle) {
            track.clear();

            return true;
        }
    }

    return false;
};

const editTimeParams = (command: EditCommand_TimeParams): boolean => {
    const timeParams = command.timeParams as TimeParams;

    const { timeSignature, pulse, stepResolution } = ((command as EditCommand_TimeParamsTimeSignature));
    if (timeSignature) {
        if (timeSignature !== timeParams.timeSignature) {
            timeParams.timeSignature = timeSignature;
            timeParams.pulse = pulse;
            timeParams.stepResolution = stepResolution;

            return true;
        }

        return false;
    }

    const tempo = (command as EditCommand_TimeParamsTempo).tempo;
    if (tempo) {
        if (tempo !== timeParams.tempo) {
            timeParams.tempo = tempo;

            return true;
        }

        return false;
    }

    const length = (command as EditCommand_TimeParamsLength).length;
    if (length) {
        if (length !== timeParams.length) {
            timeParams.length = length;

            return true;
        }
    }

    return false;
};

const editNote = (command: EditCommand_Note): boolean => {
    const note = command.note as Note;

    if (note.noteStyle !== command.noteStyle) {
        note.noteStyle = command.noteStyle;

        return true;
    }

    return false;
};
