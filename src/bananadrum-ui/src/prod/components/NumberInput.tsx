/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import { useState } from "preact/hooks";
import type { JSX } from "preact/jsx-runtime";

import { useSubscription } from "../hooks/useSubscription.js";
import type { Subscribable } from "../../../../bananadrum-core/src/prod/index.js";

export function NumberInput({ getValue, setValue, subscribable }: {
    getValue: () => string,
    setValue: (newValue: string) => void,
    subscribable: Subscribable;
}): JSX.Element {
    const [visibleValue, setVisibleValue] = useState(getValue());

    // If the model pushes a change to this value for some other reason, we'd better update
    useSubscription(subscribable, () => {
        setVisibleValue(getValue());
    });

    // To update the input as you type, but not update the model
    function attemptSetVisibleValue(inputValue: string) {
        if (inputValue.length === 0) {
            setVisibleValue("");

            return;
        }

        if (!inputValue.charAt(inputValue.length - 1).match(/[0-9]/)) {
            attemptSetVisibleValue(inputValue.substring(0, inputValue.length - 1));

            return;
        }

        setVisibleValue(inputValue);
    }

    // Try to set the model value, which may fail due to validation
    function attemptSet() {
        if (visibleValue === getValue()) {
            return;
        }

        try {
            setValue(visibleValue);
        } catch {
            setVisibleValue(getValue());
        }
    }

    return (
        <input
            className="short"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            onChange={event => {
                attemptSetVisibleValue((event.target as HTMLInputElement).value);
            }}
            value={visibleValue}
            onBlur={() => {
                attemptSet();
            }}
            onKeyPress={event => {
                if (event.key === "Enter") {
                    attemptSet();
                }
            }}
        />
    );
}
