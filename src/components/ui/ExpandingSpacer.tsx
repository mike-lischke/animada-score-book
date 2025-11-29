/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";
import { ComponentBase } from "./ComponentBase/ComponentBase.js";

export class ExpandingSpacer extends ComponentBase {
    public override render(): ComponentChild {
        return <div style={{ flexGrow: 1 }} />;
    }
}
