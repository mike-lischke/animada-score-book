/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import preact from "preact";

import { ArrangementPlayerContext } from "./ArrangementViewer.js";
import { ServicesContext } from "../ScoreBookViewer.js";
import { ArrangementControlsTop } from "./ArrangementControlsTop.js";

export const ArrangementControlsTopWithContexts: preact.FunctionComponent = () => {
    return (
        <ArrangementPlayerContext.Consumer>
            {(arrangementPlayerContext) => {
                return (
                    <ServicesContext.Consumer>
                        {(servicesContext) => {
                            return (
                                <ArrangementControlsTop
                                    arrangementPlayerContext={arrangementPlayerContext}
                                    servicesContext={servicesContext}
                                />
                            );
                        }}
                    </ServicesContext.Consumer>
                );
            }}
        </ ArrangementPlayerContext.Consumer>
    );
};
