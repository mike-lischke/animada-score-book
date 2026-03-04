/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { IPolyrhythm } from "../../core/types/general.js";
import type { UndoManager } from "../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../player/ArrangementPlayer.js";
import type { TrackPlayer } from "../../player/TrackPlayer.js";
import type { ScoreBookUiServices } from "../../player/types.js";
import { Button } from "./framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";
import { NoteViewer } from "./Note/NoteViewer.js";

export interface IPolyrhythmViewerProps extends ICommonUIProperties {
    trackPlayer: TrackPlayer;
    polyrhythm: IPolyrhythm;

    arrangementPlayer: ArrangementPlayer;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
}

interface IPolyrhythmViewerState {
    deleteMode: boolean;
    isShrouded: boolean;
}

export class PolyrhythmViewer extends UIComponent<IPolyrhythmViewerProps, IPolyrhythmViewerState> {
    public constructor(props: IPolyrhythmViewerProps) {
        super(props);

        const { polyrhythm } = this.props;

        this.state = {
            deleteMode: false,
            isShrouded: this.checkShrouded(polyrhythm)
        };
    }

    public override componentDidMount(): void {
        const { polyrhythm, services } = this.props;

        const modeManager = services.modeManager;
        this.addSubscription(modeManager, this.modeChanged);

        const track = polyrhythm.start.track;
        this.addSubscription(track, this.trackChanged);

        this.trackChanged();
    }

    public override render(): ComponentChild {
        const { polyrhythm, trackPlayer, arrangementPlayer, services, undoManager } = this.props;
        const { deleteMode, isShrouded } = this.state;

        return (
            <div id={`polyrhythm-${polyrhythm.id}`} className="polyrhythm-viewer" >
                {
                    deleteMode
                        ? (
                            <div
                                className={`delete-polyrhythm-wrapper ${isShrouded
                                    ? "shrouded"
                                    : ""}`} >
                                {
                                    isShrouded
                                        ? (<></>)
                                        : (
                                            <Button
                                                disabled={isShrouded}
                                                className="push-button"
                                                onClick={this.deleteClicked}
                                            >
                                                Delete
                                            </Button>
                                        )
                                }
                            </div >
                        )
                        : (<>
                            <div className="polyrhythm-decoration" ></div>
                            <div className="polyrhythm-notes-wrapper">
                                {polyrhythm.notes.map((note) => {
                                    return <NoteViewer
                                        note={note}
                                        key={note.id}
                                        trackPlayer={trackPlayer}
                                        arrangementPlayer={arrangementPlayer}
                                        services={services}
                                        undoManager={undoManager}
                                    />;
                                })}
                            </div>
                        </>)
                }
            </div >
        );
    }

    private modeChanged = () => {
        const { services } = this.props;
        const modeManager = services.modeManager;

        this.setState({ deleteMode: modeManager.deletePolyrhythmMode });
    };

    private trackChanged = () => {
        const { polyrhythm } = this.props;

        this.setState({ isShrouded: this.checkShrouded(polyrhythm) });
    };

    private deleteClicked = () => {
        const { polyrhythm, undoManager } = this.props;
        const track = polyrhythm.start.track;

        undoManager.edit({
            type: "EditCommand_TrackRemovePolyrhythm",
            track,
            removePolyrhythm: polyrhythm
        });
    };

    private checkShrouded(polyrhythm: IPolyrhythm) {
        const track = polyrhythm.start.track;
        for (const otherPolyrhythm of track.polyrhythms) {
            if (otherPolyrhythm !== polyrhythm) {
                if (otherPolyrhythm.start.polyrhythm === polyrhythm || otherPolyrhythm.end.polyrhythm === polyrhythm) {
                    return true;
                }
            }
        }

        return false;
    }
}
