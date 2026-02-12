/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type ComponentChild } from "preact";

import type { UndoManager } from "../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../player/ArrangementPlayer.js";
import type { ScoreBookUiServices } from "../../ui/AnimadaScoreBookUi.js";
import { About } from "./About.js";
import { ArrangementViewer } from "./Arrangement/ArrangementViewer.js";
import { Button } from "./framework/Button.js";
import { Dialog } from "./framework/Dialogs/Dialog.js";
import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";

export interface IScoreBookViewerProps extends ICommonUIProperties {
    arrangementPlayer: ArrangementPlayer;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
}

export class ScoreBookViewer extends UIComponent<IScoreBookViewerProps> {
    private aboutBoxRef = createRef<Dialog>();

    public override render(): ComponentChild {
        const { arrangementPlayer, services, undoManager } = this.props;

        return (
            <div id="score-book-viewer">
                <ArrangementViewer
                    arrangementPlayer={arrangementPlayer}
                    services={services}
                    undoManager={undoManager}
                />
                <div id="footer">
                    <Button className="anchor-button" onClick={this.handleAboutClick}>About</Button>
                </div>
                <Dialog ref={this.aboutBoxRef} >
                    <About />
                </Dialog>
            </div>
        );
    }

    private handleAboutClick = () => {
        this.aboutBoxRef.current?.open();
    };
}
