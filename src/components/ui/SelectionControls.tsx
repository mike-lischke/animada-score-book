/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type ComponentChild, type ContextType } from "preact";

import type { IArrangementView } from "../../core/index.js";
import type { SelectionManager } from "../../ui/SelectionManager.js";
import { ArrangementPlayerContext } from "./arrangement/ArrangementViewer.js";
import { ComponentBase, type IComponentState } from "./ComponentBase/ComponentBase.js";
import { ExpandingSpacer } from "./ExpandingSpacer.js";
import { OverlayStateContext } from "./Overlay.js";
import { BananaDrumContext, ServicesContext } from "./ScoreBookViewer.js";
import { SmallSpacer } from "./SmallSpacer.js";

const digitMatcher = /^\d$/;

interface ISelectionControlsState extends IComponentState {
    addingPolyrhythm: boolean;
}

export class SelectionControls extends ComponentBase<{}, ISelectionControlsState> {
    private polyrhythmInputRef = createRef<HTMLInputElement>();
    private bananaDrumContext: ContextType<typeof BananaDrumContext> | null = null;
    private overlayStateContext: ContextType<typeof OverlayStateContext> | null = null;
    private servicesContext: ContextType<typeof ServicesContext> | null = null;
    private arrangementPlayerContext: ContextType<typeof ArrangementPlayerContext> | null = null;

    public constructor(props: {}) {
        super(props);

        this.state = {
            addingPolyrhythm: false
        };
    }

    public override componentDidMount(): void {
        window.addEventListener("keypress", this.onWindowKeyPress);
    }

    public override componentWillUnmount(): void {
        this.overlayStateContext?.unsubscribe(this.overlayStateChanged);
        window.removeEventListener("keypress", this.onWindowKeyPress);
    }

    public render(): ComponentChild {
        return (
            <BananaDrumContext.Consumer>
                {(bananaDrumContext) => {
                    return (
                        <OverlayStateContext.Consumer>
                            {(overlayState) => {
                                return (
                                    <ServicesContext.Consumer>
                                        {(services) => {
                                            return (
                                                <ArrangementPlayerContext.Consumer>
                                                    {(context) => {
                                                        const { addingPolyrhythm } = this.state;
                                                        const arrangement: IArrangementView = context!.arrangement;
                                                        const selectionManager = services!.selectionManager;

                                                        if (!this.bananaDrumContext) {
                                                            this.bananaDrumContext = bananaDrumContext;
                                                            this.servicesContext = services;
                                                            this.arrangementPlayerContext = context;

                                                            this.overlayStateContext = overlayState;
                                                            overlayState?.subscribe(this.overlayStateChanged);
                                                        }

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
                                                                    <button
                                                                        className="push-button"
                                                                        onClick={() => {
                                                                            this.setState({ addingPolyrhythm: true });
                                                                            setTimeout(() => {
                                                                                this.polyrhythmInputRef.current!
                                                                                    .focus();
                                                                            }, 0);
                                                                        }}
                                                                    >add polyrhythm</button>

                                                                    <SmallSpacer />

                                                                    <button
                                                                        className="push-button"
                                                                        onClick={this.handleClearSounds}
                                                                    >Clear sounds</button>

                                                                    <ExpandingSpacer />
                                                                    <SmallSpacer />

                                                                    <button
                                                                        className="push-button"
                                                                        onClick={() => {
                                                                            selectionManager.deselectAll();
                                                                        }}
                                                                    >Cancel</button>
                                                                </div>
                                                                <div
                                                                    style={{
                                                                        alignItems: "center",
                                                                        height: "100%",
                                                                        display: addingPolyrhythm ? "flex" : "none"
                                                                    }}>
                                                                    <div className="time-control">
                                                                        New number of notes: <input
                                                                            type="text"
                                                                            inputMode="numeric"
                                                                            pattern="[0-9]*"
                                                                            onKeyPress={
                                                                                this.handleNoteCountInputKeyPress
                                                                            }
                                                                            ref={this.polyrhythmInputRef}
                                                                        />
                                                                    </div>

                                                                    <button
                                                                        className="push-button"
                                                                        onClick={() => {
                                                                            this.createPolyrhythm(
                                                                                this.polyrhythmInputRef.current!.value,
                                                                                selectionManager, arrangement);
                                                                        }}
                                                                    >go!</button>

                                                                    <ExpandingSpacer />
                                                                    <SmallSpacer />

                                                                    <button
                                                                        className="push-button"
                                                                        onClick={() => {
                                                                            this.setState({ addingPolyrhythm: false });
                                                                            this.polyrhythmInputRef.current!.value = "";
                                                                        }}
                                                                    >Cancel</button>
                                                                </div>
                                                            </div >
                                                        );
                                                    }}
                                                </ArrangementPlayerContext.Consumer>
                                            );
                                        }}
                                    </ServicesContext.Consumer>
                                );
                            }}
                        </OverlayStateContext.Consumer >
                    );
                }}
            </BananaDrumContext.Consumer>
        );
    }

    private createPolyrhythm(inputValue: string, selectionManager: SelectionManager,
        arrangement: IArrangementView): void {
        const length = Number(inputValue);
        if (!length) {
            return;
        }

        this.bananaDrumContext?.edit({
            type: "EditCommand_ArrangementAddPolyrhythms",
            arrangement,
            addPolyrhythms: { length, selection: selectionManager.selections }
        });

        selectionManager.deselectAll();
    }

    private handleClearSounds = () => {
        const selectionManager = this.servicesContext!.selectionManager;
        const arrangement = this.arrangementPlayerContext!.arrangement;

        this.bananaDrumContext?.edit({
            type: "EditCommand_ArrangementClearSelection",
            arrangement,
            clearSelection: selectionManager.selections
        });
        selectionManager.deselectAll();
    };

    private handleNoteCountInputKeyPress = (event: KeyboardEvent) => {
        const selectionManager = this.servicesContext!.selectionManager;
        const arrangement = this.arrangementPlayerContext!.arrangement;

        if (event.key === "Enter") {
            this.createPolyrhythm(
                (event.target as HTMLInputElement).value,
                selectionManager,
                arrangement);
        }
    };

    private onWindowKeyPress = (event: KeyboardEvent) => {
        const selectionManager = this.servicesContext!.selectionManager;
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
        if (!this.overlayStateContext?.visible) {
            this.setState({ addingPolyrhythm: false });
            this.polyrhythmInputRef.current!.value = "";
        }
    };
}
