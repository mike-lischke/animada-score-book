/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

export type LoadAudioStage = | "fetch" | "http" | "read-array-buffer" | "decode-audio";

interface ILoadAudioErrorDetails {
    stage: LoadAudioStage;
    filename: string;
    filepath?: string;
    responseUrl?: string;
    status?: number;
    statusText?: string;
    contentType?: string | null;
    contentLength?: string | null;
    cause?: unknown;
}

export class LoadAudioError extends Error {
    public readonly details: ILoadAudioErrorDetails;

    public constructor(message: string, details: ILoadAudioErrorDetails) {
        super(message);
        this.name = "LoadAudioError";
        this.details = details;
    }
}
