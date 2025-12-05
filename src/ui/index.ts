/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createContext } from "preact";

import type { ScoreBookDataModel } from "../core/ScoreBookDataModel.js";

const userAgentRegex = /mobile|tablet|android|ipad|iphone/i;

export const isMobile: boolean = userAgentRegex.test(navigator.userAgent);

/** Defines the structure of the app context. */
export interface AppContextType {
    dataModel: ScoreBookDataModel;
}

/** All shared data is here. */
export const AppContext = createContext<AppContextType>({} as AppContextType);

let nextId = 1;

/** @returns a new unique id for components, data entries etc. */
export const getNextId = (): number => {
    return nextId++;
};
