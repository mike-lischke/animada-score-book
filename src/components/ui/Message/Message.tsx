/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "./Message.css";

import type { ComponentChild } from "preact";

import { ComponentBase, type IComponentProperties } from "../ComponentBase/ComponentBase.js";
import type { MessageType } from "../../general-types.js";

interface IMessageProperties extends IComponentProperties {
    type: MessageType;
}

export class Message extends ComponentBase<IMessageProperties> {

    public constructor(props: IMessageProperties) {
        super(props);
    }

    public render(): ComponentChild {
        const { children, type } = this.props;
        const className = this.getEffectiveClassNames([
            "message",
            this.classFromProperty(type, ["error", "warning", "info", "response", "interactive"]),
        ]);

        return (
            <div
                className={className}
            >
                {children}
            </div>
        );
    }
}
