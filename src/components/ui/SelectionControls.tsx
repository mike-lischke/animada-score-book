/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type ComponentChild, type ContextType } from "preact";

import type { IArrangement } from "../../core/types/general.js";
import type { UndoManager } from "../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../player/ArrangementPlayer.js";
import type { ScoreBookUiServices } from "../../ui/AnimadaScoreBookUi.js";
import type { SelectionManager } from "../../ui/SelectionManager.js";
import { ExpandingSpacer } from "./ExpandingSpacer.js";
import { Button } from "./framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";
import { OverlayStateContext } from "./Overlay.js";
import { Separator } from "./Separator.js";

const digitMatcher = /^\d$/;

export interface ISelectionControlsProperties extends ICommonUIProperties {
    arrangementPlayer: ArrangementPlayer;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
}

interface ISelectionControlsState {
    addingPolyrhythm: boolean;
}

export class SelectionControls extends UIComponent<ISelectionControlsProperties, ISelectionControlsState> {
    public static override contextType = OverlayStateContext;
    declare public context: ContextType<typeof OverlayStateContext>;

    private polyrhythmInputRef = createRef<HTMLInputElement>();

    public constructor(props: ISelectionControlsProperties) {
        super(props);

        this.state = {
            addingPolyrhythm: false
        };
    }

    public override componentDidMount(): void {
        window.addEventListener("keypress", this.onWindowKeyPress);

        const context = this.context;
        if (context) {
            this.addSubscription(context, this.overlayStateChanged);
        }
    }

    public override componentWillUnmount(): void {
        super.componentWillUnmount();

        window.removeEventListener("keypress", this.onWindowKeyPress);
    }

    public render(): ComponentChild {
        const { arrangementPlayer, services } = this.props;
        const { addingPolyrhythm } = this.state;

        return (
            <OverlayStateContext.Consumer>
                {(overlayState) => {
                    const arrangement = arrangementPlayer.arrangementView;
                    const selectionManager = services.selectionManager;

                    return (
                        <div
                            className={`selection-controls ${addingPolyrhythm
                                ? "adding-polyrhythm"
                                : ""}`}
                            style={{ width: "100%", height: "100%" }}>
                            <div
                                style={{
                                    alignItems: "center",
                                    height: "100%",
                                    display: addingPolyrhythm ? "none" : "flex"
                                }}>
                                <Button
                                    className="push-button"
                                    onClick={() => {
                                        this.setState({ addingPolyrhythm: true });
                                        setTimeout(() => {
                                            this.polyrhythmInputRef.current!
                                                .focus();
                                        }, 0);
                                    }}
                                >add polyrhythm</Button>

                                <Separator />

                                <Button
                                    className="push-button"
                                    onClick={this.handleClearSounds}
                                >Clear sounds</Button>

                                <ExpandingSpacer />
                                <Separator />

                                <Button
                                    className="push-button"
                                    onClick={() => {
                                        selectionManager.deselectAll();
                                    }}
                                >Cancel</Button>
                            </div>
                            <div
                                style={{
                                    alignItems: "center",
                                    height: "100%",
                                    display: addingPolyrhythm ? "flex" : "none"
                                }}>
                                <div className="time-control">
                                    New number of notes: <input
                                        id="polyrhythm-note-count-input"
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        onKeyPress={
                                            this.handleNoteCountInputKeyPress
                                        }
                                        ref={this.polyrhythmInputRef}
                                    />
                                </div>

                                <Button
                                    className="push-button"
                                    onClick={() => {
                                        this.createPolyrhythm(
                                            this.polyrhythmInputRef.current!.value,
                                            selectionManager, arrangement);
                                    }}
                                >go!
                                </Button>

                                <ExpandingSpacer />
                                <Separator />

                                <Button
                                    className="push-button"
                                    onClick={() => {
                                        this.setState({ addingPolyrhythm: false });
                                        this.polyrhythmInputRef.current!.value = "";
                                    }}
                                >Cancel</Button>
                            </div>
                        </div >
                    );
                }}
            </OverlayStateContext.Consumer >
        );
    }

    private createPolyrhythm(inputValue: string, selectionManager: SelectionManager, arrangement: IArrangement): void {
        const { undoManager } = this.props;

        const length = Number(inputValue);
        if (!length) {
            return;
        }

        undoManager.edit({
            type: "EditCommand_ArrangementAddPolyrhythms",
            arrangement,
            addPolyrhythms: { length, selection: selectionManager.selections }
        });

        selectionManager.deselectAll();
    }

    private handleClearSounds = () => {
        const { arrangementPlayer, services, undoManager } = this.props;

        const selectionManager = services.selectionManager;
        const arrangement = arrangementPlayer.arrangementView;

        undoManager.edit({
            type: "EditCommand_ArrangementClearSelection",
            arrangement,
            clearSelection: selectionManager.selections
        });
        selectionManager.deselectAll();
    };

    private handleNoteCountInputKeyPress = (event: KeyboardEvent) => {
        const { arrangementPlayer, services } = this.props;

        const selectionManager = services.selectionManager;
        const arrangement = arrangementPlayer.arrangementView;

        if (event.key === "Enter") {
            this.createPolyrhythm(
                (event.target as HTMLInputElement).value,
                selectionManager,
                arrangement);
        }
    };

    private onWindowKeyPress = (event: KeyboardEvent) => {
        const { services } = this.props;

        const selectionManager = services.selectionManager;
        if (!(event.target instanceof HTMLInputElement) && selectionManager.selections.size
            && this.polyrhythmInputRef.current && digitMatcher.test(event.key)) {
            this.polyrhythmInputRef.current.value = event.key;

            setTimeout(() => {
                this.polyrhythmInputRef.current!.focus();
            }, 0);

            this.setState({ addingPolyrhythm: true });
        }
    };

    private overlayStateChanged = () => {
        const context = this.context;

        if (!context?.visible) {
            this.setState({ addingPolyrhythm: false });
            this.polyrhythmInputRef.current!.value = "";
        }
    };
}
