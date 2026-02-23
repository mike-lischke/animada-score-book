/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ISbDmTrack } from "../../../core/ScoreBookDataModel.js";
import type { EditCommand_TimeParamsTimeSignature } from "../../../core/types/edit_commands.js";
import type { IArrangement } from "../../../core/types/general.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { ScoreBookUiServices } from "../../../ui/AnimadaScoreBookUi.js";
import { ExpandingSpacer } from "../ExpandingSpacer.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { ChildAlignment } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { Overlay } from "../Overlay.js";
import { SelectionControls } from "../SelectionControls.js";
import { Separator } from "../Separator.js";
import { UndoRedoControls } from "./UndoRedoControls.js";

export interface IArrangementEditControlsProperties extends ICommonUIProperties {
    arrangementPlayer: ArrangementPlayer,
    services: ScoreBookUiServices,
    undoManager: UndoManager;
}

interface IArrangementEditorControlsState {
    arePolyrhythms?: boolean;
}

export class ArrangementEditControls
    extends UIComponent<IArrangementEditControlsProperties, IArrangementEditorControlsState> {

    private subscribedTracks = new Set<ISbDmTrack>();

    public constructor(props: IArrangementEditControlsProperties) {
        super(props);

        this.state = {};
    }

    public override componentDidMount(): void {
        const { arrangementPlayer, services } = this.props;
        const { arePolyrhythms } = this.state;

        const arrangement = arrangementPlayer.arrangementView;
        this.addSubscription(arrangement, this.arrangementCallback);
        this.addSubscription(arrangement, this.trackUpdate);
        this.addSubscription(services.selectionManager, this.onSelectionChange);

        arrangement.tracks.forEach((track) => {
            track.subscribe(this.arrangementCallback);
            this.subscribedTracks.add(track);
        });

        const hasPolyrhythms = this.hasPolyrhythms(arrangement);
        if (!hasPolyrhythms) {
            Overlay.toggleOverlay("delete_polyrhythms", "hide");
            services.modeManager.deletePolyrhythmMode = false;
        }

        if (arePolyrhythms !== hasPolyrhythms) {
            this.setState({ arePolyrhythms: hasPolyrhythms });
        }
    }

    public override componentWillUnmount(): void {
        super.componentWillUnmount();

        this.subscribedTracks.forEach((track) => {
            track.unsubscribe(this.arrangementCallback);
        });

        this.subscribedTracks.clear();
    }

    public render() {
        const { arrangementPlayer, services, undoManager } = this.props;
        const { arePolyrhythms } = this.state;

        const arrangementView = arrangementPlayer.arrangementView;
        const modeManager = services.modeManager;

        // TODO: move this to a score creation dialog. Changing that in an existing score makes no sense.
        const signatureSelect = (
            <Container className="time-control" crossAlignment={ChildAlignment.Center}>
                <select
                    id="time-signature-select"
                    className="short"
                    onInput={this.changeTimeSignature}
                    value={arrangementView.timeParams.timeSignature}>
                    <option>4/4</option>
                    <option>6/8</option>
                    <option>5/4</option>
                    <option>7/8</option>
                </select><span>time</span>
            </Container>
        );

        return (
            <Container
                id="arrangementEditControls"
                crossAlignment={ChildAlignment.Center}
            >
                <Button
                    id="newScoreButton"
                    onClick={() => {
                        Overlay.toggleOverlay("clear_tracks", "show");
                    }}
                    data-tooltip="Start a new score."
                >
                    Start New Score
                </Button>
                <Separator />
                <UndoRedoControls undoManager={undoManager} />

                {
                    arePolyrhythms
                        ? (
                            <>
                                <Button
                                    className="push-button"
                                    onClick={() => {
                                        modeManager.deletePolyrhythmMode = true;
                                        Overlay.toggleOverlay("delete_polyrhythms", "show");
                                    }}
                                >Delete polyrhythms...</Button>
                                <Separator />
                            </>
                        )
                        : (<></>)
                }

                <Overlay name="clear_tracks">
                    <div style={{
                        display: "flex",
                        height: "100%",
                        width: "100%",
                        boxSizing: "border-box"
                    }}>
                        <ExpandingSpacer />
                        <Button
                            className="push-button"
                            onClick={() => {
                                undoManager.edit({
                                    type: "EditCommand_ArrangementClear", arrangement: arrangementView,
                                    command: "clear all tracks"
                                });
                                Overlay.toggleOverlay("clear_tracks", "hide");
                            }}
                        >
                            Really, clear sounds
                        </Button>
                        <Separator />
                        <Button
                            className="push-button"
                            onClick={() => {
                                Overlay.toggleOverlay("clear_tracks", "hide");
                            }}
                        >
                            No, go back
                        </Button>
                    </div>
                </Overlay>

                <Overlay name="delete_polyrhythms">
                    <div style={{
                        display: "flex",
                        height: "100%",
                        width: "100%",
                        boxSizing: "border-box"
                    }}>
                        <ExpandingSpacer />
                        <Button
                            className="push-button"
                            onClick={() => {
                                return modeManager.deletePolyrhythmMode = false;
                            }}
                        >
                            Done
                        </Button>
                    </div>
                </Overlay>
                <Overlay name="selection_controls">
                    <SelectionControls
                        arrangementPlayer={arrangementPlayer}
                        services={services}
                        undoManager={undoManager}
                    />
                </Overlay>

            </Container>
        );
    }

    private hasPolyrhythms(arrangement: IArrangement): boolean {
        for (const track of arrangement.tracks) {
            if (track.polyrhythms.length) {
                return true;
            }
        }

        return false;
    }

    private arrangementCallback = () => {
        const { arrangementPlayer, services } = this.props;

        const arrangement = arrangementPlayer.arrangementView;

        const arePolyrhythms = this.hasPolyrhythms(arrangement);
        if (!arePolyrhythms) {
            Overlay.toggleOverlay("delete_polyrhythms", "hide");

            services.modeManager.deletePolyrhythmMode = false;
        }
        this.setState({ arePolyrhythms: arePolyrhythms });
    };

    private trackUpdate = (): void => {
        const { arrangementPlayer: arrangementPlayerContext } = this.props;
        const arrangement = arrangementPlayerContext.arrangementView;

        this.subscribedTracks.forEach((track) => {
            if (!arrangement.tracks.includes(track)) {
                track.unsubscribe(this.arrangementCallback);
                this.subscribedTracks.delete(track);
            }
        });

        arrangement.tracks.forEach((track) => {
            if (!this.subscribedTracks.has(track)) {
                track.subscribe(this.arrangementCallback);
                this.subscribedTracks.add(track);
            }
        });
    };

    private changeTimeSignature = (event: InputEvent) => {
        const { arrangementPlayer, undoManager } = this.props;
        const arrangementView = arrangementPlayer.arrangementView;

        const command: Partial<EditCommand_TimeParamsTimeSignature> = {
            type: "EditCommand_TimeParamsTimeSignature",
            timeParams: arrangementView.timeParams
        };

        command.timeSignature = (event.target as HTMLInputElement).value;
        switch ((event.target as HTMLInputElement).value) {
            case "4/4":
                command.stepResolution = 16;
                command.pulse = "1/4";
                break;
            case "6/8":
                command.stepResolution = 8;
                command.pulse = "3/8";
                break;
            case "5/4":
                command.stepResolution = 8;
                command.pulse = "1/2";
                break;
            case "7/8":
                command.stepResolution = 8;
                command.pulse = "1/2";
                break;
        }

        // XXX: if you need such a cast, it may be a sign that the command type definitions could be improved.
        undoManager.edit(command as EditCommand_TimeParamsTimeSignature);
    };

    private handleLengthChange = (newValue: number) => {
        const { arrangementPlayer, undoManager } = this.props;
        const arrangementView = arrangementPlayer.arrangementView;

        if (!isNaN(newValue)) {
            undoManager.edit({
                type: "EditCommand_TimeParamsLength",
                timeParams: arrangementView.timeParams,
                length: newValue
            });
        }
    };

    private onSelectionChange = () => {
        const { services } = this.props;

        const selectionManager = services.selectionManager;
        Overlay.toggleOverlay("selection_controls", selectionManager.selections.size ? "show" : "hide");
    };

};
