/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import preact from "preact";
import { ServicesContext, UndoManagerContext } from "../ScoreBookViewer.js";
import { ArrangementControlsBottom } from "./ArrangementControlsBottom.js";
import { ArrangementPlayerContext } from "./ArrangementViewer.js";

export const ArrangementControlsBottomWithContexts: preact.FunctionComponent = () => {
    return (
        <ArrangementPlayerContext.Consumer>
            {(arrangementPlayerContext) => {
                return (
                    <ServicesContext.Consumer>
                        {(servicesContext) => {
                            return (
                                <UndoManagerContext.Consumer>
                                    {(undoManager) => {
                                        return (
                                            <ArrangementControlsBottom
                                                arrangementPlayer={arrangementPlayerContext}
                                                services={servicesContext}
                                                undoManager={undoManager}
                                            />
                                        );
                                    }}
                                </UndoManagerContext.Consumer>
                            );
                        }}
                    </ServicesContext.Consumer>
                );
            }}
        </ArrangementPlayerContext.Consumer>
    );
};
