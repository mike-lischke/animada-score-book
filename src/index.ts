/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { bateriaInstruments } from "./bateria-instruments.js";
import { createAnimadaScoreBook } from "./core/AnimadaScoreBook.js";
import { getLibrary } from "./core/Library.js";
import { deserialiseArrangement } from "./core/serialisation/deserialisers.js";
import { getSerialisedArrangementFromParams } from "./core/serialisation/url.js";
import type { IArrangementSnapshot, ISerialisedArrangement } from "./core/types/snapshots.js";
import { demoSongString } from "./demo-song.js";
import { createScoreBookPlayer } from "./player/ScoreBookPlayer.js";
import { createScoreBookUi } from "./ui/AnimadaScoreBookUi.js";
import { getSessionSnapshot, resetSessionVariables } from "./ui/session-recovery.js";

const createLoadingMessage = () => {
    const loadingMessage = document.createElement("div");
    loadingMessage.id = "loading-message";
    loadingMessage.innerText = "Loading...";

    return loadingMessage;
};

const getSharedArrangement = (): ISerialisedArrangement | undefined => {
    const searchParams = new URLSearchParams(window.location.search);
    const serialisedArrangement = getSerialisedArrangementFromParams(searchParams);

    if (serialisedArrangement) {
        removeSharedArrangementFromUrl();

        return serialisedArrangement;
    }
};

const removeSharedArrangementFromUrl = () => {
    const { origin, pathname } = window.location;
    window.history.replaceState({}, "", origin + pathname);
};

const createButton = (innerText: string): HTMLButtonElement => {
    const button = document.createElement("button");
    button.classList.add("push-button");
    button.innerText = innerText;

    return button;
};

const load = (loadButtonWrapper: HTMLDivElement, arrangementToLoad: IArrangementSnapshot | ISerialisedArrangement) => {
    loadButtonWrapper.replaceWith(createLoadingMessage());

    const library = getLibrary();
    library.load(bateriaInstruments);

    if ("composition" in arrangementToLoad) {
        arrangementToLoad = deserialiseArrangement(arrangementToLoad);
    };

    const scoreBook = createAnimadaScoreBook(library, arrangementToLoad);
    const scoreBookPlayer = createScoreBookPlayer(scoreBook);
    const scoreBookUi = createScoreBookUi(scoreBookPlayer, document.getElementById("wrapper")!);

    // Expose some things for testing:
    const { arrangement } = scoreBook;
    const { arrangementPlayer } = scoreBookPlayer;
    Object.assign(window, { arrangement, arrangementPlayer, library, scoreBook, scoreBookPlayer, scoreBookUi });

    if (arrangement.title) {
        document.title = arrangement.title + " - Animada Score Book";
    }

    arrangement.subscribe(() => {
        return document.title = arrangement.title ? arrangement.title + " - Animada Score Book" : "Animada Score Book";
    });
};

const showBeatTitle = (wrapper: HTMLDivElement, title: string): void => {
    if (title) {
        const titleElement = document.createElement("h4");
        titleElement.innerText = title;
        wrapper.append(titleElement);
    }
};

// On Firefox iOS, on close/reopen, the DOM is reloaded from cache, but the script executes again
// We need to prevent that, so we check if the DOM is in the initial state first
const loadingMessageWrapper = document.getElementById("loading-message-wrapper");
if (loadingMessageWrapper) {
    const loadButtonWrapper = document.createElement("div");

    // We need to know if there's a shared beat, or a beat to reload in this tab, or neither
    const sharedArrangement = getSharedArrangement();
    if (sharedArrangement) {
        // We don't need to reset the tab-ID, we are expecting this to be a new tab
        loadButtonWrapper.innerHTML = "<p>Ready to load this beat?</p>";

        showBeatTitle(loadButtonWrapper, sharedArrangement.title ?? "Untitled");

        const loadButton = createButton("Yes!");
        loadButton.addEventListener("click", () => {
            load(loadButtonWrapper, sharedArrangement);
        });
        loadButtonWrapper.append(loadButton);
    } else {
        const sessionSnapshot = getSessionSnapshot();
        const demoArrangement = { composition: demoSongString, version: 2, title: "" };

        if (sessionSnapshot) {
            loadButtonWrapper.innerHTML = "<p>You've got a beat here. Pick up where you left off?</p>";

            showBeatTitle(loadButtonWrapper, sessionSnapshot.title ?? "Untitled");

            const loadSnapshotButton = createButton("Continue beat");
            loadSnapshotButton.addEventListener("click", () => {
                load(loadButtonWrapper, sessionSnapshot);
            });
            loadButtonWrapper.append(loadSnapshotButton);

            const loadDemoButton = createButton("Start fresh");
            loadDemoButton.addEventListener("click", () => {
                resetSessionVariables();
                load(loadButtonWrapper, demoArrangement);
            });
            loadDemoButton.style.marginLeft = "8pt";
            loadButtonWrapper.append(loadDemoButton);
        } else {
            loadButtonWrapper.innerHTML = "<p>Ready to make some beats?</p>";
            const loadButton = createButton("Yes!");
            loadButton.addEventListener("click", () => {
                load(loadButtonWrapper, demoArrangement);
            });
            loadButtonWrapper.append(loadButton);
        }
    }

    loadingMessageWrapper.replaceWith(loadButtonWrapper);
}
