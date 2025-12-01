/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { IAnimadaScoreBook } from "../Core1/types/general.js";
import type { IArrangementSnapshot } from "../Core1/types/snapshots.js";

/* eslint-disable prefer-arrow/prefer-arrow-functions, jsdoc/require-jsdoc */

// Tracking state all comes down to knowing the Session ID
// This is either generated for a new session, or hopefully retrieved on page load
// Once the Session ID is known, it can be used as a key to save things in localStorage

let sessionId: string, stateKey: string, startedAtKey: string;
resetSessionVariables(getExistingSessionId());

export function initSessionRecovery(scoreBook: IAnimadaScoreBook) {
    const existingState = localStorage.getItem(stateKey);

    if (existingState) {
        // If we're continuing previous work, we want to start tracking immediately
        scoreBook.topics.currentState.subscribe(() => {
            return setTimeout(() => {
                saveSession(scoreBook);
            }, 0);
        });
    } else {
        // If starting fresh, wait for a few changes to happen before tracking the state
        // No sense gumming up the history with nothings
        let changeCounter = 0;

        const countDownToStartSaving = () => {
            changeCounter++;
            if (changeCounter === 5) {
                localStorage.setItem(startedAtKey, String(Date.now()));
                saveSession(scoreBook);
                scoreBook.topics.currentState.unsubscribe(countDownToStartSaving);
                scoreBook.topics.currentState.subscribe(() => {
                    return setTimeout(() => {
                        saveSession(scoreBook);
                    }, 0);
                });
            }
        };

        scoreBook.topics.currentState.subscribe(countDownToStartSaving);
    }
}

export function getSessionSnapshot(): IArrangementSnapshot | null {
    const stateString = localStorage.getItem(stateKey);
    if (stateString === null) {
        return null;
    }

    const parsed = JSON.parse(stateString) as { state: IArrangementSnapshot; updatedAt: number; };

    return parsed.state;
}

// Will return something falsy if this is a new session
function getExistingSessionId(): string | undefined {
    if ("state" in window.history && window.history.state) {
        const state = window.history.state as { sessionId?: string; };

        return state.sessionId;
    }

    return sessionStorage.getItem("sessionId") ?? undefined;
}

export function resetSessionVariables(desiredSessionId?: string): void {
    sessionId = desiredSessionId ?? generateSessionId();
    stateKey = `state-${sessionId}`;
    startedAtKey = `startedAt-${sessionId}`;
    window.history.replaceState({ sessionId }, "");
    sessionStorage.setItem("sessionId", sessionId);
}

function generateSessionId(): string {
    let id = window.crypto.randomUUID();

    // A clash seems really impossible but let's mitigate it anyway.
    for (let i = 0; localStorage.getItem(`state-${id}`) && i < 100; i++) {
        id = id + "-";
    }

    return id;
}

function saveSession(scoreBook: IAnimadaScoreBook): void {
    const updatedAt = Date.now();
    const state = scoreBook.currentState;
    localStorage.setItem(stateKey, JSON.stringify({ state, updatedAt }));
}
