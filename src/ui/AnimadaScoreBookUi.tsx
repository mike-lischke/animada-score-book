/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { Overlay } from "../components/ui/Overlay.js";
import { ScoreBookViewer } from "../components/ui/ScoreBookViewer.js";
import { AnimadaScoreBook } from "../core/AnimadaScoreBook.js";
import { deserialiseArrangement } from "../core/serialisation/deserialisers.js";
import type { IAnimadaScoreBook } from "../core/types/general.js";
import type { IArrangementSnapshot } from "../core/types/snapshots.js";
import { demoSongString } from "../demo-song.js";
import { ArrangementPlayer } from "../player/ArrangementPlayer.js";
import { getEventEngine } from "../player/EventEngine.js";
import type { IArrangementPlayer } from "../player/types.js";
import { AnimationEngine } from "./AnimationEngine.js";
import { ModeManager } from "./ModeManager.js";
import { MouseHandler } from "./MouseHandler.js";
import { SelectionManager } from "./SelectionManager.js";

export interface ScoreBookUiServices {
    animationEngine: AnimationEngine;
    selectionManager: SelectionManager;
    modeManager: ModeManager;
}

export interface IAnimadaScoreBookUiProperties extends ICommonUIProperties {
    currentArrangementSnapshot?: IArrangementSnapshot;
}

interface IAnimadaScoreBookUiState {
    needUpdate: boolean;
    currentArrangementSnapshot?: IArrangementSnapshot;
}

/**
 * The main UI component for the Animada Score Book. It's supposed to exist only once per application and for the
 * entire lifetime of the application.
 * So we set up certain global services here like the Animation Engine, Keyboard and Mouse Handlers, Selection and
 * Mode Managers.
 */
export class AnimadaScoreBookUi extends UIComponent<IAnimadaScoreBookUiProperties, IAnimadaScoreBookUiState> {
    private scoreBook!: IAnimadaScoreBook;
    private arrangementPlayer!: IArrangementPlayer;

    private eventEngine = getEventEngine();
    private animationEngine: AnimationEngine;
    private selectionManager: SelectionManager;
    private modeManager: ModeManager;
    private mouseHandler?: MouseHandler;

    public constructor(props: IAnimadaScoreBookUiProperties) {
        super(props);

        this.state = {
            needUpdate: true
        };

        this.animationEngine = new AnimationEngine(this.eventEngine);
        this.selectionManager = new SelectionManager();
        this.modeManager = new ModeManager(this.selectionManager);

        this.initServices();

        // Load the initial arrangement to have a player ready.
        this.loadScorebook();
        //initSessionRecovery(this.scoreBook);
    }

    public static override getDerivedStateFromProps(nextProps: IAnimadaScoreBookUiProperties,
        previousState: IAnimadaScoreBookUiState
    ): IAnimadaScoreBookUiState | null {
        if (nextProps.currentArrangementSnapshot !== previousState.currentArrangementSnapshot) {
            // Recreate the arrangement player when the arrangement changes.
            return {
                needUpdate: true,
                currentArrangementSnapshot: nextProps.currentArrangementSnapshot
            };
        }

        return {
            needUpdate: false
        };
    }

    public render() {
        const { needUpdate } = this.state;

        if (needUpdate) {
            this.eventEngine.disconnect(this.arrangementPlayer);
            this.arrangementPlayer.dispose();
            this.loadScorebook();

            this.setState({
                needUpdate: false
            });
        }

        return (
            <ScoreBookViewer
                scoreBook={this.scoreBook}
                arrangementPlayer={this.arrangementPlayer}
                services={{
                    animationEngine: this.animationEngine,
                    selectionManager: this.selectionManager,
                    modeManager: this.modeManager
                }}
            />
        );
    }

    private loadScorebook() {
        let { currentArrangementSnapshot } = this.props;

        currentArrangementSnapshot ??= deserialiseArrangement(
            { composition: demoSongString, version: 2, title: "Demo Song" });

        this.scoreBook = new AnimadaScoreBook(currentArrangementSnapshot);
        this.arrangementPlayer = new ArrangementPlayer(this.scoreBook.arrangement);
        this.eventEngine.connect(this.arrangementPlayer);

        if (this.scoreBook.arrangement.title) {
            document.title = this.scoreBook.arrangement.title + " - Animada Score Book";
        }
    }

    private initServices(): void {
        window.addEventListener("keydown", (event) => {
            this.handleKeyDown(event);
        });
        window.addEventListener("keyup", (event) => {
            this.handleKeyUp(event);
        });

        this.mouseHandler = new MouseHandler(this.modeManager, this.selectionManager);
    }

    private handleKeyDown(event: KeyboardEvent): void {
        switch (event.key) {
            case "Escape":
                Overlay.closeAllOverlays();
                this.selectionManager.deselectAll();
                this.modeManager.deletePolyrhythmMode = false;
                break;
            case " ":
                if (this.eventEngine.state === "stopped") {
                    void this.eventEngine.play();
                } else {
                    this.eventEngine.stop();
                }
                event.preventDefault(); // This is to prevent spaces getting written in number inputs
                break;
            case "Alt":
                this.modeManager.deletePolyrhythmMode = true;
                event.preventDefault();
                break;
            case "Backspace":
            case "Delete":
                if (!(event.target instanceof HTMLInputElement)) {
                    this.scoreBook.edit({
                        type: "EditCommand_ArrangementClearSelection",
                        arrangement: this.scoreBook.arrangement,
                        clearSelection: this.selectionManager.selections
                    });
                    this.selectionManager.deselectAll();
                }
                break;

            // Undo/Redo: We have different conventions between Mac and Windows
            // Windows: ctrl+z / ctrl+y
            // Mac: command+z / command+shift+z
            // We allow overlap for maximum cross-browser consistency, except where it actually causes confusion
            case "z":
                if (event.ctrlKey || event.metaKey) {
                    if (event.shiftKey) {
                        this.scoreBook.redo();
                    } else {
                        // Standard redo on Mac, and no problem to allow it on Windows
                        this.scoreBook.undo();
                    } // With ctrl, this doesn't even trigger on Mac. Seems harmless to include it anyway.
                }
                break;
            case "y":
                // We do not allow command+y to redo on Mac
                // On Chrome, Firefox, and Safari, it triggers browser things, and so is very confusing to also redo
                if (event.ctrlKey) {
                    this.scoreBook.redo();
                }
                break;
        }
    }

    private handleKeyUp(event: KeyboardEvent): void {
        if (event.key === "Alt") {
            this.modeManager.deletePolyrhythmMode = false;
        }
    }

}
