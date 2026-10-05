/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { afterEach, describe, expect, it } from "vitest";

import { PlayerPlayState } from "../../src/player/ArrangementPlayer.js";
import { requisitions } from "../../src/supplement/Requisitions.js";
import { AnimationEngine } from "../../src/ui/AnimationEngine.js";

/** A player stub whose play state the test sets, so the engine sees the transitions it has to react to. */
interface IPlayStateProvider {
    state: PlayerPlayState;
    currentTime: number;
}

const createProvider = (): IPlayStateProvider => {
    return {
        state: PlayerPlayState.Stopped,
        currentTime: 0,
    };
};

/** @returns The animation states the requisitions deliver, in the order they arrive. */
const collectAnimationStates = (): PlayerPlayState[] => {
    const states: PlayerPlayState[] = [];
    requisitions.register("animationStateChanged", (state) => {
        states.push(state);

        return Promise.resolve(true);
    });

    return states;
};

describe("AnimationEngine", { concurrent: false }, () => {
    afterEach(() => {
        requisitions.unregister();
    });

    it("reports the running animation while its player plays", async () => {
        const provider = createProvider();
        const engine = new AnimationEngine(provider);
        const states = collectAnimationStates();

        provider.state = PlayerPlayState.Playing;
        await requisitions.execute("playerStateChanged", provider.state);

        expect(states).toEqual([PlayerPlayState.Playing]);

        engine.dispose();
    });

    it("ignores the playback of the player that replaced it", async () => {
        const staleEngine = new AnimationEngine(createProvider());
        staleEngine.dispose();

        const liveProvider = createProvider();
        const liveEngine = new AnimationEngine(liveProvider);
        const states = collectAnimationStates();

        liveProvider.state = PlayerPlayState.Playing;
        await requisitions.execute("playerStateChanged", liveProvider.state);

        // The disposed engine used to report the end of playback here, which hid the play beam right after the
        // running engine had shown it.
        expect(states).toEqual([PlayerPlayState.Playing]);

        liveEngine.dispose();
    });
});
