/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild, ContextType } from "preact";

import type { IPolyrhythm } from "../../core/types/general.js";
import { Button } from "./framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";
import { NoteViewerWithContexts } from "./Note/NoteViewerWithContexts.js";
import { ServicesContext, UndoManagerContext } from "./ScoreBookViewer.js";

export interface IPolyrhythmViewerProps extends ICommonUIProperties {
    polyrhythm: IPolyrhythm;
}

interface IPolyrhythmViewerState {
    deleteMode: boolean;
    isShrouded: boolean;
}

export class PolyrhythmViewer extends UIComponent<IPolyrhythmViewerProps, IPolyrhythmViewerState> {
    private servicesContext: ContextType<typeof ServicesContext> | null = null;
    private scoreBookContext: ContextType<typeof UndoManagerContext> | null = null;

    public constructor(props: IPolyrhythmViewerProps) {
        super(props);

        const { polyrhythm } = this.props;

        this.state = {
            deleteMode: false,
            isShrouded: this.checkShrouded(polyrhythm)
        };
    }

    public override componentWillUnmount(): void {
        const { polyrhythm } = this.props;

        const modeManager = this.servicesContext?.modeManager;
        modeManager?.unsubscribe(this.modeChanged);

        const track = polyrhythm.start.track;
        track.subscribe(this.trackChanged);
    }

    public override render(): ComponentChild {
        const { polyrhythm } = this.props;
        const { deleteMode, isShrouded } = this.state;

        return (
            <UndoManagerContext.Consumer>
                {(scoreBookContext) => {
                    this.scoreBookContext = scoreBookContext;

                    return (
                        <ServicesContext.Consumer>
                            {(services) => {
                                if (!this.servicesContext) {
                                    this.servicesContext = services;

                                    const modeManager = services!.modeManager;
                                    modeManager.subscribe(this.modeChanged);
                                    this.modeChanged();

                                    const track = polyrhythm.start.track;
                                    track.subscribe(this.trackChanged);
                                    this.trackChanged();

                                    return null;
                                }

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
                                                            return <NoteViewerWithContexts note={note} key={note.id} />;
                                                        })}
                                                    </div>
                                                </>)
                                        }
                                    </div >
                                );
                            }}
                        </ServicesContext.Consumer>
                    );
                }}
            </UndoManagerContext.Consumer>
        );
    }

    private modeChanged = () => {
        const modeManager = this.servicesContext!.modeManager;

        this.setState({ deleteMode: modeManager.deletePolyrhythmMode });
    };

    private trackChanged = () => {
        const { polyrhythm } = this.props;

        this.setState({ isShrouded: this.checkShrouded(polyrhythm) });
    };

    private deleteClicked = () => {
        const { polyrhythm } = this.props;
        const track = polyrhythm.start.track;

        this.scoreBookContext?.edit({
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
