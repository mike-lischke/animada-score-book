/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "./Publisher.js";
import type { IInstrument, INoteStyle, IPackedInstrument } from "./types/general.js";

/**
 * This should be the only instance of an instrument.
 * So if this is called, the instrument must start unloaded.
 */
export class Instrument extends Publisher implements IInstrument {
    /** Base folder for audio files under the public assets. */
    private static readonly soundBasePath = "sounds";
    /** Shared audio context used to decode instrument audio buffers. */
    private static readonly audioCtx: AudioContext = new AudioContext();

    public loaded = false;
    public id: string;
    public displayOrder: number;
    public displayName: string;
    public icon: string;
    public colourGroup: string;

    public readonly noteStyles: Record<string, INoteStyle> = {};
    public readonly unpackPromises: Array<Promise<AudioBuffer>> = [];

    public constructor(packedInstrument: IPackedInstrument) {
        super();

        const { id, packedNoteStyles, displayOrder, displayName, colourGroup } = packedInstrument;
        this.id = id;
        this.displayOrder = displayOrder;
        this.displayName = displayName;
        this.icon = packedInstrument.icon;
        this.colourGroup = colourGroup;

        packedNoteStyles.forEach(({ id, file, symbol, muting }) => {
            this.noteStyles[id] = { id, symbol, audioBuffer: null, instrument: this, muting };
            this.unpackPromises.push(
                Instrument.loadAudio(file).then((audioBuffer) => {
                    return this.noteStyles[id].audioBuffer = audioBuffer;
                })
            );
        });

        void Promise.all(this.unpackPromises).then(() => {
            this.loaded = true;
            this.publish();
        });
    }

    /**
     * Loads and decodes an audio file from the public `sounds/` folder.
     *
     * @param filename The file name under the `sounds` directory.
     * @returns A promise resolving to the decoded `AudioBuffer`.
     */
    private static async loadAudio(filename: string): Promise<AudioBuffer> {
        const filepath = `${Instrument.soundBasePath}/${filename}`;
        const response = await fetch(filepath);
        const arrayBuffer = await response.arrayBuffer();

        return Instrument.audioCtx.decodeAudioData(arrayBuffer);
    }
}
