/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild, ContextType } from "preact";

import type { IPolyrhythmView } from "../../core/index.js";
import { ComponentBase, type IComponentProperties, type IComponentState } from "./ComponentBase/ComponentBase.js";
import { NoteViewer } from "./note/NoteViewer.js";
import { BananaDrumContext, ServicesContext } from "./ScoreBookViewer.js";

export interface IPolyrhythmViewerProps extends IComponentProperties {
    polyrhythm: IPolyrhythmView;
}

interface IPolyrhythmViewerState extends IComponentState {
    deleteMode: boolean;
    isShrouded: boolean;
}

export class PolyrhythmViewer extends ComponentBase<IPolyrhythmViewerProps, IPolyrhythmViewerState> {
    private servicesContext: ContextType<typeof ServicesContext> | null = null;
    private bananaDrumContext: ContextType<typeof BananaDrumContext> | null = null;

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
            <BananaDrumContext.Consumer>
                {(bananaDrumContext) => {
                    this.bananaDrumContext = bananaDrumContext;

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
                                                                    <button
                                                                        disabled={isShrouded}
                                                                        className="push-button"
                                                                        onClick={this.deleteClicked}
                                                                    >
                                                                        Delete
                                                                    </button>
                                                                )
                                                        }
                                                    </div >
                                                )
                                                : (<>
                                                    <div className="polyrhythm-decoration" ></div>
                                                    <div className="polyrhythm-notes-wrapper">
                                                        {polyrhythm.notes.map((note) => {
                                                            return <NoteViewer note={note} key={note.id} />;
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
            </BananaDrumContext.Consumer>
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

        this.bananaDrumContext?.edit({
            type: "EditCommand_TrackRemovePolyrhythm",
            track,
            removePolyrhythm: polyrhythm
        });
    };

    private checkShrouded(polyrhythm: IPolyrhythmView) {
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
