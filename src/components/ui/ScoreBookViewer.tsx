/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createContext, createRef, type ComponentChild } from "preact";

import type { UndoManager } from "../../core/UndoManager.js";
import type { IArrangementPlayer } from "../../player/types.js";
import type { ScoreBookUiServices } from "../../ui/AnimadaScoreBookUi.js";
import { About } from "./About.js";
import { ArrangementViewer } from "./Arrangement/ArrangementViewer.js";
import { Dialog } from "./framework/Dialogs/Dialog.js";
import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";
import { Button } from "./framework/Button.js";

export const ServicesContext = createContext<ScoreBookUiServices | null>(null);
export const UndoManagerContext = createContext<UndoManager | null>(null);

export interface IScoreBookViewerProps extends ICommonUIProperties {
    undoManager: UndoManager;
    arrangementPlayer: IArrangementPlayer;
    services: ScoreBookUiServices;
}

export class ScoreBookViewer extends UIComponent<IScoreBookViewerProps> {
    private aboutBoxRef = createRef<Dialog>();

    public override render(): ComponentChild {
        const { undoManager, arrangementPlayer, services } = this.props;

        return (
            <div id="score-book-viewer">
                <UndoManagerContext.Provider value={undoManager}>
                    <ServicesContext.Provider value={services}>
                        <ArrangementViewer arrangementPlayer={arrangementPlayer} />
                        <div id="footer">
                            <Button className="anchor-button" onClick={this.handleAboutClick}>About</Button>
                        </div>
                        <Dialog ref={this.aboutBoxRef} >
                            <About />
                        </Dialog>
                    </ServicesContext.Provider>
                </UndoManagerContext.Provider>
            </div>
        );
    }

    private handleAboutClick = () => {
        this.aboutBoxRef.current?.open();
    };
}
