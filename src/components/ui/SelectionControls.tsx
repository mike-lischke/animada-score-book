/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type ComponentChild, type ContextType } from "preact";

import type { ISbDmArrangement, ScoreBookDataModel } from "../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../core/UndoManager.js";
import type { ScoreBookUiServices } from "../../player/types.js";
import type { SelectionManager } from "../../ui/SelectionManager.js";
import { ExpandingSpacer } from "./ExpandingSpacer.js";
import { Button } from "./framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";
import { OverlayStateContext } from "./Overlay.js";
import { requisitions } from "../../supplement/Requisitions.js";
import { Separator } from "./Separator.js";

const digitMatcher = /^\d$/;

export interface ISelectionControlsProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
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
        requisitions.register("overlayVisibilityChanged", this.handleOverlayVisibilityChanged);
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("overlayVisibilityChanged", this.handleOverlayVisibilityChanged);
        window.removeEventListener("keypress", this.onWindowKeyPress);
    }

    public render(): ComponentChild {
        const { dataModel, services } = this.props;
        const { addingPolyrhythm } = this.state;

        return (
            <OverlayStateContext.Consumer>
                {(overlayState) => {
                    const arrangement = dataModel.arrangement!;
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
                                    onClick={this.handleClearSounds}
                                >Clear sounds</Button>

                                <ExpandingSpacer />
                                <Separator />

                                <Button
                                    onClick={() => {
                                        selectionManager.clearSelection();
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

    private createPolyrhythm(inputValue: string, selectionManager: SelectionManager,
        arrangement: ISbDmArrangement): void {
        const { undoManager } = this.props;

        const length = Number(inputValue);
        if (!length) {
            return;
        }

        undoManager.edit({
            type: "EditCommand_ArrangementAddPolyrhythms",
            arrangement,
            addPolyrhythms: { length, selection: selectionManager.currentTrackSelections }
        });

        selectionManager.clearSelection();
    }

    private handleClearSounds = () => {
        const { dataModel, services, undoManager } = this.props;

        const selectionManager = services.selectionManager;
        const arrangement = dataModel.arrangement!;

        undoManager.edit({
            type: "EditCommand_ArrangementClearSelection",
            arrangement,
            clearSelection: selectionManager.currentTrackSelections
        });
        selectionManager.clearSelection();
    };

    private handleNoteCountInputKeyPress = (event: KeyboardEvent) => {
        const { dataModel, services } = this.props;

        const selectionManager = services.selectionManager;
        const arrangement = dataModel.arrangement!;

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
        if (!(event.target instanceof HTMLInputElement) && selectionManager.currentTrackSelections.size
            && this.polyrhythmInputRef.current && digitMatcher.test(event.key)) {
            this.polyrhythmInputRef.current.value = event.key;

            setTimeout(() => {
                this.polyrhythmInputRef.current!.focus();
            }, 0);

            this.setState({ addingPolyrhythm: true });
        }
    };

    private handleOverlayVisibilityChanged = (data: { name: string; visible: boolean; }): Promise<boolean> => {
        if (data.name !== "selection_controls") {
            return Promise.resolve(false);
        }

        if (!data.visible) {
            this.setState({ addingPolyrhythm: false });
            this.polyrhythmInputRef.current!.value = "";
        }

        return Promise.resolve(true);
    };
}
