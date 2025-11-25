/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import { createContext, type JSX } from "preact";

import type { BananaDrum } from "../../core/index.js";
import type { BananaDrumPlayer } from "../../player/types.js";
import type { BananaDrumUiServices } from "../../ui/BananaDrumUi.js";
import { About } from "./About.js";
import { ArrangementViewer } from "./arrangement/ArrangementViewer.js";
import { Overlay, toggleOverlay } from "./Overlay.js";

export const ServicesContext = createContext<BananaDrumUiServices | null>(null);
export const BananaDrumContext = createContext<BananaDrum | null>(null);

export function BananaDrumViewer({ bananaDrumPlayer, services }: {
    bananaDrumPlayer: BananaDrumPlayer,
    services: BananaDrumUiServices;
}): JSX.Element {
    return (
        <div id="banana-drum" className="overlay-wrapper">
            <BananaDrumContext.Provider value={bananaDrumPlayer.bananaDrum}>
                <ServicesContext.Provider value={services}>
                    <ArrangementViewer arrangementPlayer={bananaDrumPlayer.arrangementPlayer} />
                    <div id="footer">
                        <button className="anchor-button" onClick={() => {
                            toggleOverlay("about", "show");
                        }}>About</button>
                    </div>
                    <Overlay name="about">
                        <About />
                    </Overlay>
                </ServicesContext.Provider>
            </BananaDrumContext.Provider>
        </div>
    );
}
