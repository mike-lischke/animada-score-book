/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { LoadAudioError, type LoadAudioStage } from "./LoadAudioError.js";
import type { IInstrumentMeta } from "./ScoreBookDataModel.js";
import { requisitions } from "../supplement/Requisitions.js";
import { getSharedAudioContext } from "./audio-context.js";
import { SbDmEntityType, type ISbDmInstrument, type ISbDmInstrumentImage } from "./ScoreBookDataModel.js";
import type { INoteStyle } from "./types/general.js";
import { getNewId } from "./utils.js";

/**
 * All details about a specific instrument, including its note styles and associated audio buffers.
 * This is the main class representing an instrument in the data model.
 */
export class Instrument implements ISbDmInstrument {
    public readonly type = SbDmEntityType.Instrument;
    public readonly id: number;
    public readonly typeId: string;
    public readonly displayOrder: number;
    public readonly displayName: string;
    public readonly image: ISbDmInstrumentImage;
    public readonly color: string;

    public readonly range: [number, number] = [0, -1];
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
    private static readonly audioCtx = getSharedAudioContext();

    public constructor(instrumentMeta: IInstrumentMeta) {
        const { id, variants, displayOrder, displayName, color, typeId } = instrumentMeta;
        this.id = id;
        this.typeId = typeId;
        this.displayOrder = displayOrder;
        this.displayName = displayName;
        this.image = { type: SbDmEntityType.InstrumentImage, id: getNewId(), filePath: instrumentMeta.icon };
        this.color = color;

        const loadPromises: Array<Promise<AudioBuffer>> = [];
        variants.forEach(({ id, file, symbol, characteristics, noteLine }) => {
            this.noteStyles[id] = {
                id, symbol, audioBuffer: null, instrument: this, characteristics, noteLine,
            };
            loadPromises.push(
                Instrument.loadAudio(file).then((audioBuffer) => {
                    return this.noteStyles[id].audioBuffer = audioBuffer;
                })
            );
        });

        void Promise.all(loadPromises).then(() => {
            this.state.initialized = true;
            void requisitions.execute("instrumentLoaded", this.id);
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

        const createLoadAudioError = (message: string, stage: LoadAudioStage, cause?: unknown) => {
            return new LoadAudioError(message, {
                stage,
                filename,
                filepath,
                responseUrl: response.url,
                status: response.status,
                statusText: response.statusText,
                contentType: response.headers.get("content-type"),
                contentLength: response.headers.get("content-length"),
                cause,
            });
        };

        let response: Response;

        try {
            response = await fetch(filepath);
        } catch (cause) {
            throw createLoadAudioError("Network error while fetching audio file.", "fetch", cause);
        }

        if (!response.ok) {
            throw createLoadAudioError("HTTP error while fetching audio file.", "http");
        }

        const arrayBuffer = await response.arrayBuffer().catch((cause: unknown) => {
            throw createLoadAudioError("Failed to read response as ArrayBuffer.", "read-array-buffer", cause);
        });

        try {
            return await Instrument.audioCtx.decodeAudioData(arrayBuffer);
        } catch (cause) {
            throw createLoadAudioError("Failed to decode audio data.", "decode-audio", cause);
        }
    }
}
