/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";
import { UIComponent } from "./framework/UIComponent.js";

export class Separator extends UIComponent {
    public render(): ComponentChild {
        return <span className="separator" />;
    }
}
