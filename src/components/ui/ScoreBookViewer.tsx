/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createContext, createRef, type ComponentChild } from "preact";

import type { IAnimadaScoreBook } from "../../core/types/general.js";
import type { IArrangementPlayer } from "../../player/types.js";
import type { ScoreBookUiServices } from "../../ui/AnimadaScoreBookUi.js";
import { About } from "./About.js";
import { ArrangementViewer } from "./Arrangement/ArrangementViewer.js";
import { Dialog } from "./framework/Dialog/Dialog.js";
import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";

export const ServicesContext = createContext<ScoreBookUiServices | null>(null);
export const AnimadaScoreBookContext = createContext<IAnimadaScoreBook | null>(null);

export interface IScoreBookViewerProps extends ICommonUIProperties {
    scoreBook: IAnimadaScoreBook;
    arrangementPlayer: IArrangementPlayer;
    services: ScoreBookUiServices;
}

export class ScoreBookViewer extends UIComponent<IScoreBookViewerProps> {
    private aboutBoxRef = createRef<Dialog>();

    public override render(): ComponentChild {
        const { scoreBook, arrangementPlayer, services } = this.props;

        return (
            <div id="score-book-viewer">
                <AnimadaScoreBookContext.Provider value={scoreBook}>
                    <ServicesContext.Provider value={services}>
                        <ArrangementViewer arrangementPlayer={arrangementPlayer} />
                        <div id="footer">
                            <button className="anchor-button" onClick={this.handleAboutClick}>About</button>
                        </div>
                        <Dialog ref={this.aboutBoxRef} >
                            <About />
                        </Dialog>
                    </ServicesContext.Provider>
                </AnimadaScoreBookContext.Provider>
            </div>
        );
    }

    private handleAboutClick = () => {
        this.aboutBoxRef.current?.open();
    };
}
