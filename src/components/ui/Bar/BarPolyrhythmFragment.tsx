/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ISbDmNote, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { IPolyrhythm } from "../../../core/types/general.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../../player/ArrangementPlayer.js";
import type { TrackPlayer } from "../../../player/TrackPlayer.js";
import type { ScoreBookUiServices } from "../../../player/types.js";
import { Button } from "../framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { NoteViewer } from "../Note/NoteViewer.js";

export interface IBarPolyrhythmFragmentProps extends ICommonUIProperties {
    polyrhythm: IPolyrhythm;
    barNumber: number;
    noteSlice: ISbDmNote[];

    trackPlayer: TrackPlayer;
    arrangementPlayer: ArrangementPlayer;
    touchEditingEnabled: boolean;
    services: ScoreBookUiServices;
    undoManager: UndoManager;
    dataModel: ScoreBookDataModel;
}

interface IBarPolyrhythmFragmentState {
    deleteMode: boolean;
}

/**
 * Renders the slice of a polyrhythm that falls within a single bar, with bracket decoration
 * appropriate for its position in the polyrhythm span.
 */
export class BarPolyrhythmFragment
    extends UIComponent<IBarPolyrhythmFragmentProps, IBarPolyrhythmFragmentState> {

    public constructor(props: IBarPolyrhythmFragmentProps) {
        super(props);

        this.state = { deleteMode: false };
    }

    public override componentDidMount(): void {
        const { services } = this.props;
        this.addSubscription(services.modeManager, this.modeChanged);
    }

    public override render(): ComponentChild {
        const { polyrhythm, barNumber, noteSlice, trackPlayer, arrangementPlayer, services,
            touchEditingEnabled, undoManager, dataModel } = this.props;
        const { deleteMode } = this.state;

        if (deleteMode) {
            return (
                <div
                    id={`bar-polyrhythm-${polyrhythm.id}-${barNumber}`}
                    className="polyrhythm-fragment frag-full"
                >
                    <div className="delete-polyrhythm-wrapper">
                        <Button onClick={this.deleteClicked}>Delete</Button>
                    </div>
                </div>
            );
        }

        return (
            <div
                id={`bar-polyrhythm-${polyrhythm.id}-${barNumber}`}
                className="polyrhythm-fragment frag-full"
            >
                <div className="polyrhythm-decoration" />
                <div className="polyrhythm-notes-wrapper">
                    {noteSlice.map((note) => {
                        return (
                            <NoteViewer
                                note={note}
                                key={note.id}
                                trackPlayer={trackPlayer}
                                arrangementPlayer={arrangementPlayer}
                                touchHoldEnabled={touchEditingEnabled}
                                dataModel={dataModel}
                                services={services}
                                undoManager={undoManager}
                            />
                        );
                    })}
                </div>
            </div>
        );
    }

    private modeChanged = () => {
        const { services } = this.props;
        this.setState({ deleteMode: services.modeManager.deletePolyrhythmMode });
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
}
