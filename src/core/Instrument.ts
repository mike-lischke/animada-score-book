/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "./Publisher.js";
import { SbDmEntityType, type ISbDmInstrument, type ISbDmInstrumentImage } from "./ScoreBookDataModel.js";
import type { INoteStyle } from "./types/general.js";
import type { IInstrumentMeta } from "./ScoreBookDataModel.js";
import { getNewId } from "./utils.js";

/**
 * This should be the only instance of an instrument.
 * So if this is called, the instrument must start unloaded.
 */
export class Instrument extends Publisher implements ISbDmInstrument {
    public readonly type = SbDmEntityType.Instrument;
    public readonly id: number;
    public readonly typeId: string;
    public readonly displayOrder: number;
    public readonly displayName: string;
    public readonly image: ISbDmInstrumentImage;
    public readonly color: string;

    public readonly audioPath: string;
    public readonly range: [number, number] = [0, 127];
    public readonly state = {
        initialized: false,
        isLeaf: true,
        expanded: false,
        expandedOnce: false,
    };

    public readonly noteStyles: Record<string, INoteStyle> = {};

    /** Base folder for audio files under the public assets. */
    private static readonly soundBasePath = "sounds";

    /** Shared audio context used to decode instrument audio buffers. */
    private static readonly audioCtx = new AudioContext();

    public constructor(instrumentMeta: IInstrumentMeta) {
        super();

        const { id, variants, displayOrder, displayName, color, typeId } = instrumentMeta;
        this.id = id;
        this.typeId = typeId;
        this.displayOrder = displayOrder;
        this.displayName = displayName;
        this.image = { type: SbDmEntityType.InstrumentImage, id: getNewId(), filePath: instrumentMeta.icon };
        this.color = color;
        this.audioPath = `${Instrument.soundBasePath}/instrument_${typeId}/`;

        const unpackPromises: Array<Promise<AudioBuffer>> = [];
        variants.forEach(({ id, file, symbol, muting }) => {
            this.noteStyles[id] = { id, symbol, audioBuffer: null, instrument: this, muting };
            unpackPromises.push(
                Instrument.loadAudio(file).then((audioBuffer) => {
                    return this.noteStyles[id].audioBuffer = audioBuffer;
                })
            );
        });

        void Promise.all(unpackPromises).then(() => {
            this.state.initialized = true;
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

    public get noteStyleCount(): number {
        return Object.keys(this.noteStyles).length + 1; // + 1 for rests
    };

}
