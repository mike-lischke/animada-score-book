/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { bateriaInstruments } from "../bateria-instruments.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { ScoreBookViewer } from "../components/ui/ScoreBookViewer.js";
import { createAnimadaScoreBook } from "../core/AnimadaScoreBook.js";
import { getLibrary } from "../core/Library.js";
import { deserialiseArrangement } from "../core/serialisation/deserialisers.js";
import type { IAnimadaScoreBook } from "../core/types/general.js";
import type { IArrangementSnapshot } from "../core/types/snapshots.js";
import { demoSongString } from "../demo-song.js";
import { createScoreBookPlayer } from "../player/ScoreBookPlayer.js";
import type { ScoreBookPlayer } from "../player/types.js";
import { AnimationEngine } from "./AnimationEngine.js";
import { createKeyboardHandler } from "./KeyboardHandler.js";
import { createModeManager, ModeManager } from "./ModeManager.js";
import { createMouseHandler } from "./MouseHandler.js";
import { createSelectionManager, SelectionManager } from "./SelectionManager.js";
import { initSessionRecovery } from "./session-recovery.js";

export interface ScoreBookUiServices {
    animationEngine: AnimationEngine;
    selectionManager: SelectionManager;
    modeManager: ModeManager;
}

export interface IScoreBookUiProps extends ICommonUIProperties {
    arrangementToLoad?: IArrangementSnapshot;
}

export class ScoreBookUi extends UIComponent<IScoreBookUiProps> {
    private services: ScoreBookUiServices;
    private scoreBook: IAnimadaScoreBook;
    private scoreBookPlayer: ScoreBookPlayer;

    public constructor(props: IScoreBookUiProps) {
        super(props);

        const library = getLibrary();
        library.load(bateriaInstruments);

        let arrangementToLoad = props.arrangementToLoad;
        arrangementToLoad ??= deserialiseArrangement({ composition: demoSongString, version: 2, title: "Demo Song" });

        this.scoreBook = createAnimadaScoreBook(library, arrangementToLoad);
        this.scoreBookPlayer = createScoreBookPlayer(this.scoreBook);
        this.services = this.initServices(this.scoreBookPlayer);

        const { arrangement } = this.scoreBook;
        if (arrangement.title) {
            document.title = arrangement.title + " - Animada Score Book";
        }

        arrangement.subscribe(() => {
            return document.title = arrangement.title
                ? arrangement.title + " - Animada Score Book"
                : "Animada Score Book";
        });

    }

    public render() {
        return (
            <ScoreBookViewer
                scoreBookPlayer={this.scoreBookPlayer}
                services={this.services}
            />
        );
    }

    private initServices(scoreBookPlayer: ScoreBookPlayer): ScoreBookUiServices {
        const animationEngine = new AnimationEngine(scoreBookPlayer.eventEngine);
        const selectionManager = createSelectionManager();
        const modeManager = createModeManager(selectionManager);

        createKeyboardHandler(scoreBookPlayer.eventEngine, scoreBookPlayer.scoreBook, selectionManager, modeManager);
        createMouseHandler(modeManager, selectionManager);
        initSessionRecovery(scoreBookPlayer.scoreBook);

        return { animationEngine, selectionManager, modeManager };
    }

}
