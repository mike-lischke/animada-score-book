/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

let sharedAudioContext: AudioContext | null = null;

/**
 * Returns the app-wide shared AudioContext instance.
 *
 * Using a singleton keeps mobile Safari happy, where multiple contexts can fail or become unreliable.
 *
 * @returns The shared AudioContext instance used across the app.
 */
export const getSharedAudioContext = (): AudioContext => {
    sharedAudioContext ??= new AudioContext();

    return sharedAudioContext;
};
