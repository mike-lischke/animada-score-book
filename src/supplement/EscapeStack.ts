/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Stack } from "./Stack.js";

type EscHandler = () => void;

class EscapeStack extends Stack<EscHandler> {
    public attach() {
        window.addEventListener("keydown", this.handleKey);
    }

    public detach() {
        window.removeEventListener("keydown", this.handleKey);
    }

    /**
     * Removes the given handler from the stack.
     *
     * @param handler The handler to remove from the stack.
     * @returns True if the handler was found and removed, false otherwise.
     */
    public remove(handler: EscHandler): boolean {
        const index = this.indexOf(handler);
        if (index >= 0) {
            this.splice(index, 1);

            return true;
        }

        return false;
    }

    private handleKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape") {
            return;
        }

        const handler = this.pop();
        if (handler) {
            e.stopPropagation();
            e.preventDefault();
            handler();
        }
    };

}

export const escapeStack = new EscapeStack();
