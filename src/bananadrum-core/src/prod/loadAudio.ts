/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

// Currently this module knows where we keep sound files
// Later we will probably want to move this to a config file
const path = "sounds";
const ctx: AudioContext = new AudioContext();

export const loadAudio = async (filename: string): Promise<AudioBuffer> => {
    const filepath = `${path}/${filename}`;
    const response = await fetch(filepath);
    const arrayBuffer = await response.arrayBuffer();

    return ctx.decodeAudioData(arrayBuffer);
};
