/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import { useCallback, useContext, useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact/jsx-runtime";

import type { ArrangementView } from "../../../core/index.js";
import { useEditCommand } from "../../../ui/hooks/useEditCommand.js";
import { useStateSubscription } from "../../../ui/hooks/useStateSubscription.js";
import { useSubscription } from "../../../ui/hooks/useSubscription.js";
import { ArrangementPlayerContext } from "./ArrangementViewer.js";

export function ArrangementTitle({ editMode, onEditEnd }: { editMode: boolean, onEditEnd: () => void; }): JSX.Element {
    const arrangement = useContext(ArrangementPlayerContext)!.arrangement;
    const title = useStateSubscription(arrangement, (arrangement: ArrangementView) => {
        return arrangement.title;
    });
    const edit = useEditCommand();

    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editMode) {
            inputRef.current?.focus();
        }
    }, [editMode]);

    const [inputValue, setInputValue] = useState(arrangement.title);
    useSubscription(arrangement, () => {
        setInputValue(arrangement.title);
    });

    const keyUpHandler = useCallback((event: KeyboardEvent) => {
        if (event.key === "Enter") { // Enter means submit the changes and stop editing
            edit({
                type: "EditCommand_ArrangementTitle",
                arrangement,
                newTitle: (event.target as HTMLInputElement).value
            });
            onEditEnd();
        }

        if (event.key === "Escape") { // Escape means stop editing and discard the changes
            setInputValue(arrangement.title);
            onEditEnd();
        }
    }, []);

    // Click out of the input means submit the changes and stop editing
    const blurHandler = useCallback((event: FocusEvent) => {
        edit({ type: "EditCommand_ArrangementTitle", arrangement, newTitle: (event.target as HTMLInputElement).value });
        onEditEnd();
    }, []);

    return (
        <div id="title-wrapper" style={{ textAlign: "center" }}>
            {
                editMode
                    ? <input
                        ref={inputRef}
                        onBlur={blurHandler}
                        onChange={(e) => {
                            setInputValue((e.target as HTMLInputElement).value);
                        }}
                        onKeyUp={keyUpHandler}
                        onKeyDown={e => {
                            e.stopPropagation();
                        }} // Don't want to trigger global keyboard handlers, like play-on-spacebar
                        style={{
                            height: "unset",
                            width: "100%",
                            border: "none",
                            textAlign: "center",
                            fontSize: "2em",
                            fontWeight: "bold",
                            marginBlockStart: "0.67em",
                            marginBlockEnd: "0.67em",
                            padding: "0"
                        }}
                        placeholder="Add a title..."
                        value={inputValue}
                    />
                    : <h1>{title}</h1>
            }
        </div>
    );
}
