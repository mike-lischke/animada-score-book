/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

export class Stack<T> extends Array<T> {

    /** @returns True if there's content in this class. */
    public get empty(): boolean {
        return this.length === 0;
    }

    /** @returns The top element if there's content or undefined if the stack is empty. */
    public get top(): T | undefined {
        if (!this.empty) {
            return this[this.length - 1];
        }

        return undefined;
    }
}
