/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { loadAudio } from "./loadAudio.js";
import { createPublisher } from "./Publisher.js";
import type {
    Instrument, InstrumentMeta, Library, NoteStyle, NoteStyleBase, PackedInstrument
} from "./types/general.js";

const packedInstruments: Record<string, PackedInstrument | undefined> = {};
const instruments: Record<string, Instrument | undefined> = {};

const instrumentMetas: InstrumentMeta[] = [];

export const getLibrary = (): Library => {
    return { instrumentMetas, load, getInstrument };
};

const load = (instrumentCollection: PackedInstrument[]): void => {
    instrumentCollection.forEach(packedInstrument => {
        packedInstruments[packedInstrument.id] = packedInstrument;
        instrumentMetas.push({
            id: packedInstrument.id,
            displayOrder: packedInstrument.displayOrder,
            displayName: packedInstrument.displayName,
            colourGroup: packedInstrument.colourGroup,
            noteStyles: createNoteStyleBases(packedInstrument)
        });
    });
};

const getInstrument = (id: string): Instrument => {
    if (!instruments[id]) {
        if (!packedInstruments[id]) {
            throw new Error("Unknown instrument requested from Library");
        }
        instruments[id] = createInstrument(packedInstruments[id]);
    }

    return instruments[id];
};

const createNoteStyleBases = (packedInstrument: PackedInstrument): Record<string, NoteStyleBase> => {
    const noteStyleBases: Record<string, NoteStyleBase> = {};
    for (const [id, style] of Object.entries(packedInstrument.packedNoteStyles)) {
        noteStyleBases[id] = { id, symbol: style.symbol };
    }

    return noteStyleBases;
};

// This should be the only instance of an instrument
// So if this is called, the instrument must start unloaded
const createInstrument = (packedInstrument: PackedInstrument): Instrument => {
    const { id, packedNoteStyles, displayOrder, displayName, colourGroup } = packedInstrument;
    const publisher = createPublisher();

    let loaded = false;
    const noteStyles: Record<string, NoteStyle> = {};
    const unpackPromises: Array<Promise<AudioBuffer>> = [];

    const instrument: Instrument = {
        id, noteStyles, displayOrder, displayName, colourGroup,
        get loaded() {
            return loaded;
        },
        subscribe: publisher.subscribe, unsubscribe: publisher.unsubscribe
    };

    packedNoteStyles.forEach(({ id, file, symbol, muting }) => {
        noteStyles[id] = { id, symbol, audioBuffer: null, instrument, muting };
        unpackPromises.push(
            loadAudio(file)
                .then(audioBuffer => {
                    return noteStyles[id].audioBuffer = audioBuffer;
                })
        );
    });

    void Promise.all(unpackPromises).then(() => {
        loaded = true;
        publisher.publish();
    });

    return instrument;
};

export const getNoteStyleCount = (instrumentId: string): number => {
    const instrument = getLibrary().getInstrument(instrumentId);

    return Object.keys(instrument.noteStyles).length + 1; // + 1 for rests
};
