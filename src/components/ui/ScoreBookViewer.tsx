/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createContext, createRef, type ComponentChild } from "preact";

import type { IAnimadaScoreBook } from "../../core/index.js";
import type { ScoreBookPlayer } from "../../player/types.js";
import type { ScoreBookUiServices } from "../../ui/BananaDrumUi.js";
import { About } from "./About.js";
import { ArrangementViewer } from "./arrangement/ArrangementViewer.js";
import { ComponentBase, type IComponentProperties } from "./ComponentBase/ComponentBase.js";
import { Popup } from "./Popup.js";

export const ServicesContext = createContext<ScoreBookUiServices | null>(null);
export const BananaDrumContext = createContext<IAnimadaScoreBook | null>(null);

export interface IScoreBookViewerProps extends IComponentProperties {
    bananaDrumPlayer: ScoreBookPlayer;
    services: ScoreBookUiServices;
}

export class ScoreBookViewer extends ComponentBase<IScoreBookViewerProps> {
    private aboutBoxRef = createRef<HTMLDivElement>();

    public override render(): ComponentChild {
        const { bananaDrumPlayer, services } = this.props;

        return (
            <div id="banana-drum">
                <BananaDrumContext.Provider value={bananaDrumPlayer.bananaDrum}>
                    <ServicesContext.Provider value={services}>
                        <ArrangementViewer arrangementPlayer={bananaDrumPlayer.arrangementPlayer} />
                        <div id="footer">
                            <button className="anchor-button" onClick={() => {
                                if (this.aboutBoxRef.current) {
                                    if (this.aboutBoxRef.current.classList.contains("visible")) {
                                        this.aboutBoxRef.current.classList.remove("visible");
                                    } else {
                                        this.aboutBoxRef.current.classList.add("visible");
                                    }
                                }
                            }}>About</button>
                        </div>
                        <Popup innerRef={this.aboutBoxRef} >
                            <About />
                        </Popup>
                    </ServicesContext.Provider>
                </BananaDrumContext.Provider>
            </div>
        );
    }
}
