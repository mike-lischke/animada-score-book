/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { requisitions } from "../../supplement/Requisitions.js";

export class OverlayState {
    private isVisible = false;

    public constructor(public readonly name: string) {
    }

    public get visible(): boolean {
        return this.isVisible;
    }

    public set visible(value: boolean) {
        if (this.isVisible !== value) {
            this.isVisible = value;
            void requisitions.execute("overlayVisibilityChanged", { name: this.name, visible: value });
        }
    }
}
