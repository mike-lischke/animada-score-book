/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Instrument } from "./Instrument.js";
import type { IInstrument, IInstrumentMeta, ILibrary, INoteStyleBase, IPackedInstrument } from "./types/general.js";

const packedInstruments: Record<string, IPackedInstrument | undefined> = {};
const instruments: Record<string, IInstrument | undefined> = {};

const instrumentMetas: IInstrumentMeta[] = [];

export const getLibrary = (): ILibrary => {
    return { instrumentMetas, load, getInstrument };
};

const load = (instrumentCollection: IPackedInstrument[]): void => {
    instrumentCollection.forEach((packedInstrument) => {
        packedInstruments[packedInstrument.id] = packedInstrument;
        instrumentMetas.push({
            id: packedInstrument.id,
            displayOrder: packedInstrument.displayOrder,
            displayName: packedInstrument.displayName,
            icon: packedInstrument.icon,
            colourGroup: packedInstrument.colourGroup,
            noteStyles: createNoteStyleBases(packedInstrument)
        });
    });
};

const getInstrument = (id: string): IInstrument => {
    if (!instruments[id]) {
        if (!packedInstruments[id]) {
            throw new Error("Unknown instrument requested from Library");
        }
        instruments[id] = new Instrument(packedInstruments[id]);
    }

    return instruments[id];
};

const createNoteStyleBases = (packedInstrument: IPackedInstrument): Record<string, INoteStyleBase> => {
    const noteStyleBases: Record<string, INoteStyleBase> = {};
    for (const [id, style] of Object.entries(packedInstrument.packedNoteStyles)) {
        noteStyleBases[id] = { id, symbol: style.symbol };
    }

    return noteStyleBases;
};

export const getNoteStyleCount = (instrumentId: string): number => {
    const instrument = getLibrary().getInstrument(instrumentId);

    return Object.keys(instrument.noteStyles).length + 1; // + 1 for rests
};
