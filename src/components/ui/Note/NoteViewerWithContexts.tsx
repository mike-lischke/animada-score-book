/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import preact from "preact";

import { ArrangementPlayerContext } from "../Arrangement/ArrangementViewer.js";
import { ServicesContext, UndoManagerContext } from "../ScoreBookViewer.js";
import { TrackPlayerContext } from "../Track/TrackViewer.js";
import { NoteViewer, type INoteViewerProps } from "./NoteViewer.js";

/**
 * A HOC to pass multiple contexts to NoteViewer.
 *
 * @param props The actual noteviewer props.
 *
 * @returns The component.
 */
export const NoteViewerWithContexts: preact.FunctionComponent<INoteViewerProps> = (props: INoteViewerProps) => {
    return (
        <UndoManagerContext.Consumer>
            {(scoreBookContext) => {
                return (
                    <ArrangementPlayerContext.Consumer>
                        {(arrangementPlayerContext) => {
                            return (
                                <TrackPlayerContext.Consumer>
                                    {(trackPlayerContext) => {
                                        return (
                                            <ServicesContext.Consumer>
                                                {(servicesContext) => {
                                                    return (
                                                        <NoteViewer
                                                            {...props}
                                                            arrangementPlayerContext={arrangementPlayerContext}
                                                            trackPlayerContext={trackPlayerContext}
                                                            servicesContext={servicesContext}
                                                            undoManagerContext={scoreBookContext}
                                                        />
                                                    );
                                                }}
                                            </ServicesContext.Consumer>
                                        );
                                    }}
                                </TrackPlayerContext.Consumer>
                            );
                        }}
                    </ArrangementPlayerContext.Consumer>
                );
            }}
        </UndoManagerContext.Consumer>
    );
};
