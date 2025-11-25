/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import undoIcon from "../../../../../assets/images/icons/undo_white.svg";
import redoIcon from "../../../../../assets/images/icons/redo_white.svg";

import { useContext } from "preact/hooks";

import { BananaDrumContext } from "../BananaDrumViewer.js";
import { SmallSpacer } from "../SmallSpacer.js";
import type { JSX } from "preact/jsx-runtime";
import { useStateSubscription } from "../../hooks/useStateSubscription.js";

export function UndoRedo(): JSX.Element {
    const bananaDrum = useContext(BananaDrumContext)!;

    const canUndo = useStateSubscription(bananaDrum.topics.canUndo, () => {
        return bananaDrum.canUndo;
    });
    const canRedo = useStateSubscription(bananaDrum.topics.canRedo, () => {
        return bananaDrum.canRedo;
    });

    return (<div className='undo-redo-wrapper'>
        <button className='push-button medium gray' disabled={!canUndo} onClick={bananaDrum.undo}>
            <img src={undoIcon} style={{ height: "0.78em" }} />
        </button>
        <SmallSpacer />
        <button className='push-button medium gray' disabled={!canRedo} onClick={bananaDrum.redo}>
            <img src={redoIcon} style={{ height: "0.78em" }} />
        </button>
    </div>);
}
