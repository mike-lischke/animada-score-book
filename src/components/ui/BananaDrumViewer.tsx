/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import { createContext, createRef, type JSX } from "preact";

import type { BananaDrum } from "../../core/index.js";
import type { BananaDrumPlayer } from "../../player/types.js";
import type { BananaDrumUiServices } from "../../ui/BananaDrumUi.js";
import { About } from "./About.js";
import { ArrangementViewer } from "./arrangement/ArrangementViewer.js";
import { toggleOverlay } from "./Overlay.js";
import { Popup } from "./Popup.js";

export const ServicesContext = createContext<BananaDrumUiServices | null>(null);
export const BananaDrumContext = createContext<BananaDrum | null>(null);

export function BananaDrumViewer({ bananaDrumPlayer, services }: {
    bananaDrumPlayer: BananaDrumPlayer,
    services: BananaDrumUiServices;
}): JSX.Element {
    const aboutBoxRef = createRef<HTMLDivElement>();

    return (
        <div id="banana-drum">
            <BananaDrumContext.Provider value={bananaDrumPlayer.bananaDrum}>
                <ServicesContext.Provider value={services}>
                    <ArrangementViewer arrangementPlayer={bananaDrumPlayer.arrangementPlayer} />
                    <div id="footer">
                        <button className="anchor-button" onClick={() => {
                            if (aboutBoxRef.current) {
                                if (aboutBoxRef.current.classList.contains("visible")) {
                                    aboutBoxRef.current.classList.remove("visible");
                                } else {
                                    aboutBoxRef.current.classList.add("visible");
                                }
                            }
                        }}>About</button>
                    </div>
                    <Popup innerRef={aboutBoxRef} >
                        <About />
                    </Popup>
                </ServicesContext.Provider>
            </BananaDrumContext.Provider>
        </div>
    );
}
