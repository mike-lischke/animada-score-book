/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import { useContext, useRef, useState } from "preact/hooks";
import type { JSX } from "preact/jsx-runtime";

import type { ArrangementView } from "../../../../bananadrum-core/src/prod/index.js";
import { ServicesContext } from "../components/BananaDrumViewer.js";
import { useEditCommand, type EditFunction } from "../hooks/useEditCommand.js";
import { useKeyboardEvent } from "../hooks/useKeyboardEvent.js";
import { useSubscription } from "../hooks/useSubscription.js";
import type { SelectionManager } from "../SelectionManager.js";
import { ArrangementPlayerContext } from "./arrangement/ArrangementViewer.js";
import { ExpandingSpacer } from "./ExpandingSpacer.js";
import { OverlayStateContext } from "./Overlay.js";
import { SmallSpacer } from "./SmallSpacer.js";

const digitMatcher = /^\d$/;

export function SelectionControls(): JSX.Element {
    const arrangement = useContext(ArrangementPlayerContext)!.arrangement;
    const selectionManager = useContext(ServicesContext)!.selectionManager;
    const overlayState = useContext(OverlayStateContext)!;
    const polyrhythmInputRef = useRef<HTMLInputElement>(null);
    const edit = useEditCommand();

    const [addingPolyrhythm, setAddingPolyrhythm] = useState(false);

    useSubscription(overlayState, () => {
        if (!overlayState.visible) {
            setAddingPolyrhythm(false);
            polyrhythmInputRef.current!.value = "";
        }
    });

    useKeyboardEvent(window, "keypress", event => {
        if (!(event.target instanceof HTMLInputElement) && selectionManager.selections.size
            && polyrhythmInputRef.current && digitMatcher.test(event.key)) {
            polyrhythmInputRef.current.value = event.key;
            setTimeout(() => {
                polyrhythmInputRef.current!.focus();
            }, 0);
            setAddingPolyrhythm(true);
        }
    });

    return (
        <div
            className={`selection-controls ${addingPolyrhythm ? "adding-polyrhythm" : ""}`}
            style={{ width: "100%", height: "100%" }}>
            <div style={{ alignItems: "center", height: "100%", display: addingPolyrhythm ? "none" : "flex" }}>
                <button
                    className="push-button"
                    onClick={() => {
                        return (setAddingPolyrhythm(true), setTimeout(() => {
                            polyrhythmInputRef.current!.focus();
                        }, 0));
                    }}
                >add polyrhythm</button>

                <SmallSpacer />

                <button
                    className="push-button"
                    onClick={() => {
                        edit({
                            type: "EditCommand_ArrangementClearSelection",
                            arrangement,
                            clearSelection: selectionManager.selections
                        });
                        selectionManager.deselectAll();
                    }}
                >Clear sounds</button>

                <ExpandingSpacer />
                <SmallSpacer />

                <button
                    className="push-button"
                    onClick={() => {
                        selectionManager.deselectAll();
                    }}
                >Cancel</button>
            </div>
            <div style={{ alignItems: "center", height: "100%", display: addingPolyrhythm ? "flex" : "none" }}>
                <div className="time-control">
                    New number of notes: <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onKeyPress={event => {
                            if (event.key === "Enter") {
                                createPolyrhythm((event.target as HTMLInputElement).value, selectionManager,
                                    arrangement, edit);
                            }
                        }}
                        ref={polyrhythmInputRef}
                    />
                </div>

                <button
                    className="push-button"
                    onClick={() => {
                        createPolyrhythm(polyrhythmInputRef.current!.value, selectionManager, arrangement, edit);
                    }}
                >go!</button>

                <ExpandingSpacer />
                <SmallSpacer />

                <button
                    className="push-button"
                    onClick={() => {
                        return (setAddingPolyrhythm(false), polyrhythmInputRef.current!.value = "");
                    }}
                >Cancel</button>
            </div>
        </div >
    );
}

function createPolyrhythm(inputValue: string, selectionManager: SelectionManager, arrangement: ArrangementView,
    edit: EditFunction): void {
    const length = Number(inputValue);
    if (!length) {
        return;
    }

    edit({
        type: "EditCommand_ArrangementAddPolyrhythms",
        arrangement,
        addPolyrhythms: { length, selection: selectionManager.selections }
    });

    selectionManager.deselectAll();
}
