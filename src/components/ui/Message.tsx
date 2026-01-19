/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";
import type { MessageType } from "./framework/ui-types.js";

interface IMessageProperties extends ICommonUIProperties {
    messageType: MessageType;
}

export class Message extends UIComponent<IMessageProperties> {

    public constructor(props: IMessageProperties) {
        super(props);
    }

    public render(): ComponentChild {
        const { children, messageType } = this.props;
        const className = this.generateFinalClassName([
            "message",
            this.classFromProperty(messageType, ["error", "warning", "info", "response", "interactive"]),
        ]);

        return (
            <div className={className}>
                {children}
            </div>
        );
    }
}
