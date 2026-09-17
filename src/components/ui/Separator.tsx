/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";

export class Separator extends UIComponent<ICommonUIProperties> {
    public render(): ComponentChild {
        const { style } = this.props;

        return <span className="separator" style={style} />;
    }
}
