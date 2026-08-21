/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { type ComponentChild, createRef } from "preact";

import { AppStorage } from "../../../core/AppStorage.js";
import type { ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import { isMobile } from "../../../ui/index.js";
import { Button } from "../framework/Button.js";
import { Checkbox } from "../framework/Checkbox.js";
import { UIIcon } from "../framework/UIIcon.js";
import { Container } from "../framework/Container.js";
import { FieldSet } from "../framework/FieldSet.js";
import { GooeyGroup } from "../framework/GooeyGroup.js";
import { Icon } from "../framework/Icon.js";
import { Image, PredefinedImage } from "../framework/Image.js";
import { Label } from "../framework/Label.js";
import { ProgressIndicator } from "../framework/ProgressIndicator.js";
import { Slider } from "../framework/Slider.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { PlayStopButton } from "./PlayStopButton.js";
import { Grid } from "../framework/Grid.js";
import { GridCell } from "../framework/GridCell.js";
import { Dialog } from "../framework/Dialog.js";

export interface IArrangementPlayControlsProperties extends ICommonUIProperties {
    arrangementPlayer: ArrangementPlayer,
    dataModel: ScoreBookDataModel;
    editMode: boolean;
}

interface IArrangementPlayControlsState {
    editingTitle: boolean;
    title: string;

    currentVolume: number;
    currentTempo: number;

    /** The tempo as stored in the arrangement (last persisted value). Used to detect playback deviations. */
    scoreTempo: number;

    recordingInProgress: boolean;
}

export class ArrangementPlayControls
    extends UIComponent<IArrangementPlayControlsProperties, IArrangementPlayControlsState> {
    private recordingDialogRef = createRef<Dialog>();

    public constructor(props: IArrangementPlayControlsProperties) {
        super(props);

        const arrangementView = props.dataModel.arrangement!;
        const tempo = arrangementView.timeParams.tempo;
        this.state = {
            editingTitle: false,
            title: arrangementView.title,
            currentVolume: arrangementView.mainVolume,
            currentTempo: tempo,
            scoreTempo: tempo,
            recordingInProgress: false,
        };
    }

    public override componentDidMount(): void {
        requisitions.register("arrangementChanged", this.handleArrangementTitleChanged);
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("arrangementChanged", this.handleArrangementTitleChanged);
    }

    public override componentDidUpdate(previousProps: Readonly<IArrangementPlayControlsProperties>,
        previousState: Readonly<IArrangementPlayControlsState>): void {
        const { arrangementPlayer, dataModel, editMode } = this.props;
        const { recordingInProgress, scoreTempo } = this.state;

        const arrangement = dataModel.arrangement!;

        // A new arrangement (and player) was loaded (e.g., New Song) — re-sync the tempo baseline so the
        // edit-mode restore below does not overwrite the new score with a stale tempo.
        if (previousProps.arrangementPlayer !== arrangementPlayer) {
            this.setState({
                currentTempo: arrangement.timeParams.tempo,
                scoreTempo: arrangement.timeParams.tempo,
            });

            return;
        }

        // When entering edit mode, restore the arrangement tempo so the user edits from the saved baseline.
        if (!previousProps.editMode && editMode) {
            arrangement.timeParams.tempo = scoreTempo;
            this.setState({ currentTempo: scoreTempo });

            return;
        }

        // Sync currentTempo when the arrangement tempo changes externally (undo/redo in edit mode,
        // or arrangement reload). In edit mode also keep scoreTempo in sync.
        if (previousState.currentTempo !== arrangement.timeParams.tempo) {
            if (editMode) {
                this.setState({
                    currentTempo: arrangement.timeParams.tempo,
                    scoreTempo: arrangement.timeParams.tempo,
                });
            } else {
                this.setState({ currentTempo: arrangement.timeParams.tempo });
            }
        }

        if (!previousState.recordingInProgress && recordingInProgress) {
            this.recordingDialogRef.current?.open();
        } else if (previousState.recordingInProgress && !recordingInProgress) {
            this.recordingDialogRef.current?.close(true);
        }
    }

    public override shouldComponentUpdate(nextProps: Readonly<IArrangementPlayControlsProperties>,
        nextState: Readonly<IArrangementPlayControlsState>): boolean {
        const { arrangementPlayer, dataModel, editMode } = this.props;
        const { editingTitle, title, currentVolume, currentTempo, scoreTempo, recordingInProgress } = this.state;

        if (arrangementPlayer !== nextProps.arrangementPlayer) {
            return true;
        }

        if (dataModel !== nextProps.dataModel) {
            return true;
        }

        if (editMode !== nextProps.editMode) {
            return true;
        }

        if (editingTitle !== nextState.editingTitle) {
            return true;
        }

        if (title !== nextState.title) {
            return true;
        }

        if (currentVolume !== nextState.currentVolume) {
            return true;
        }

        if (currentTempo !== nextState.currentTempo) {
            return true;
        }

        if (scoreTempo !== nextState.scoreTempo) {
            return true;
        }

        if (recordingInProgress !== nextState.recordingInProgress) {
            return true;
        }

        return false;
    }

    public override render(): ComponentChild {
        const { arrangementPlayer, dataModel, editMode } = this.props;
        const { currentVolume, currentTempo, scoreTempo, recordingInProgress } = this.state;

        const arrangementView = dataModel.arrangement!;
        const tempoDeviates = !editMode && currentTempo !== scoreTempo;

        let tempoLabel: ComponentChild;
        if (tempoDeviates) {
            tempoLabel = (
                <Label
                    caption={`${currentTempo} bpm *`}
                    style={{ fontSize: "80%", marginTop: "4px", whiteSpace: "nowrap", fontStyle: "italic" }}
                    data-tooltip={`Playback tempo (${currentTempo} bpm) differs from the arrangement`
                        + ` tempo (${scoreTempo} bpm). Enter Edit Mode to persist the change.`}
                />
            );
        } else {
            tempoLabel = (
                <Label
                    caption={`${currentTempo} bpm`}
                    style={{ fontSize: "80%", marginTop: "4px", whiteSpace: "nowrap" }}
                />
            );
        }

        return (
            <Grid id="arrangementPlayControls" columns={[160, "auto"]} {...this.dataAttributes}>
                <Container
                    orientation={Orientation.TopDown}
                    mainAlignment={ChildAlignment.Start}
                    crossAlignment={ChildAlignment.Start}
                >
                    <FieldSet legend="Play / Record" className="flex">
                        <GooeyGroup className="playControlsGooey" background="var(--color-base-200)">
                            <PlayStopButton id="playbackButton" arrangementPlayer={arrangementPlayer} />
                            <Button
                                plain
                                id="recordButton"
                                data-tooltip="Record your song and export it as an MP3 file."
                                disabled={recordingInProgress}
                                onClick={() => {
                                    void this.startRecording();
                                }}
                            >
                                <Image key="recordButton" src={PredefinedImage.Record} data-tooltip="inherit" />
                            </Button>
                        </GooeyGroup>
                    </FieldSet>
                </Container>
                <Container
                    orientation={Orientation.TopDown}
                    mainAlignment={ChildAlignment.SpaceEvenly}
                    crossAlignment={ChildAlignment.Stretch}
                    data-tooltip="Tempo for playback (beats per minute)"
                    style={{ width: "100%" }}
                >
                    <Container
                        mainAlignment={ChildAlignment.Stretch}
                        crossAlignment={ChildAlignment.Center}
                        gap={4}
                    >
                        <Icon src={UIIcon.Pulse} data-tooltip="inherit" />
                        <Slider
                            id="tempoSlider"
                            value={currentTempo}
                            min={30}
                            max={200}
                            step={5}
                            data-tooltip="inherit"
                            className="du-range-xs"
                            onChange={(value) => {
                                if (editMode) {
                                    dataModel.setTempo(value);
                                    this.setState({ currentTempo: value, scoreTempo: value });
                                } else {
                                    this.setState({ currentTempo: value });
                                    arrangementView.timeParams.tempo = value;
                                }
                            }}
                        />
                        {tempoLabel}
                    </Container>
                    <Container
                        mainAlignment={ChildAlignment.Start}
                        crossAlignment={ChildAlignment.Center}
                        gap={4}
                    >
                        <Icon src={UIIcon.Unmute} data-tooltip="inherit" />
                        <Slider
                            id="volumeSlider"
                            value={currentVolume}
                            min={0}
                            max={100}
                            data-tooltip="inherit"
                            className="du-range-xs"
                            onChange={(value) => {
                                arrangementView.mainVolume = value;
                                this.setState({ currentVolume: arrangementView.mainVolume }, () => {
                                    AppStorage.saveSetting("masterVolume", arrangementView.mainVolume);
                                });
                            }}
                        />
                        <Label
                            caption={`${Math.round(currentVolume)}%`}
                            style={{ fontSize: "80%", marginTop: "4px", whiteSpace: "nowrap" }}
                        />
                    </Container>
                </Container>
                <GridCell columnSpan={2}>
                    <FieldSet legend="Play Options" style={{ flex: "1 1 auto" }} className="flex">
                        <Container
                            gap={16}
                            style={{ flex: "1 1 auto", padding: "0 24px", whiteSpace: "nowrap" }}
                            mainAlignment={ChildAlignment.SpaceBetween}
                        >
                            <Container gap={4}>
                                <Checkbox
                                    data-tooltip="inherit"
                                    checked={arrangementView.loop}
                                    onChange={(checked) => {
                                        arrangementView.loop = checked;
                                        AppStorage.saveSetting("loop", checked);
                                    }}
                                />
                                <Label caption="Loop" />
                            </Container>
                            <Container gap={4}>
                                <Checkbox
                                    data-tooltip="inherit"
                                    checked={arrangementView.countIn}
                                    onChange={(checked) => {
                                        arrangementView.countIn = checked;
                                        AppStorage.saveSetting("countIn", checked);
                                    }}
                                />
                                <Label caption="Count In" />
                            </Container>
                            <Container gap={4}>
                                <Checkbox
                                    data-tooltip="inherit"
                                    checked={arrangementView.useMetronome}
                                    onChange={(checked) => {
                                        arrangementView.useMetronome = checked;
                                        AppStorage.saveSetting("metronome", checked);
                                    }}
                                />
                                <Label caption="Metronome" />
                            </Container>
                        </Container>
                    </FieldSet>
                </GridCell>
                <Dialog
                    id="recordingDialog"
                    ref={this.recordingDialogRef}
                    caption="Recording Arrangement"
                    className="recordingDialog"
                    onClose={this.handleRecordingDialogClose}
                >
                    <Container
                        orientation={Orientation.TopDown}
                        gap={10}
                        style={{ minWidth: "280px" }}
                    >
                        <Label caption="Please wait while the MP3 file is being created..." />
                        <ProgressIndicator linear indicatorHeight={8} style={{ flex: "0 0 auto" }} />
                    </Container>
                </Dialog>
            </Grid >
        );
    }

    private handleArrangementTitleChanged = (arrangementId: number): Promise<boolean> => {
        const { dataModel } = this.props;
        const arrangement = dataModel.arrangement!;

        if (arrangementId !== arrangement.id) {
            return Promise.resolve(false);
        }

        this.setState({ title: arrangement.title });

        return Promise.resolve(true);
    };

    private startRecording = async () => {
        const { arrangementPlayer, dataModel } = this.props;
        const { recordingInProgress } = this.state;

        if (recordingInProgress) {
            return;
        }

        this.setState({ recordingInProgress: true });

        try {
            const blob = await arrangementPlayer.renderToBlob();
            const fileName = `${dataModel.arrangement!.title}.mp3`;

            if (isMobile && typeof navigator.share === "function"
                && typeof navigator.canShare === "function") {
                const exportFile = new File([blob], fileName, { type: "audio/mpeg" });
                if (navigator.canShare({ files: [exportFile] })) {
                    try {
                        await navigator.share({
                            files: [exportFile],
                            title: fileName,
                        });

                        return;
                    } catch (error) {
                        if (!(error instanceof DOMException) || error.name !== "AbortError") {
                            console.warn("File share failed, falling back to direct download.", error);
                        } else {
                            return;
                        }
                    }
                }
            }

            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            a.rel = "noopener";
            a.target = "_blank";
            a.click();

            // Keep the URL alive briefly so Safari can consume it before revoking.
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 1000);
        } catch (error) {
            console.error("Recording export failed", error);
            alert("The recording could not be exported. Please try again.");
        } finally {
            this.setState({ recordingInProgress: false });
        }
    };

    private handleRecordingDialogClose = (): void => {
        const { recordingInProgress } = this.state;

        if (recordingInProgress) {
            setTimeout(() => {
                this.recordingDialogRef.current?.open();
            }, 0);
        }
    };
};
