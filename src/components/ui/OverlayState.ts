/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Publisher } from "../../Core1/Publisher.js";

export class OverlayState extends Publisher {
    private isVisible = false;

    public get visible(): boolean {
        return this.isVisible;
    }

    public set visible(value: boolean) {
        if (this.isVisible !== value) {
            this.isVisible = value;
            this.publish();
        }
    }
}
