/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { type ComponentChild } from "preact";

import { isMobile } from "../../ui/isMobile.js";
import { ComponentBase, type IComponentProperties } from "./ComponentBase/ComponentBase.js";

export interface ITouchHoldDetectorProps extends IComponentProperties {
    callback: () => void;
    holdLength: number;
}

export class TouchHoldDetector extends ComponentBase<ITouchHoldDetectorProps> {
    private timeoutIdRef = 0;

    public render(): ComponentChild {
        const { children } = this.props;

        return (
            <div
                className="hold-detector"
                onTouchStart={this.onTouchStart}
                onTouchMove={this.cancel}
                onTouchEnd={this.cancel}
                onContextMenu={(e) => {
                    e.preventDefault();
                }}
                style={{ width: "100%", height: "100%" }}
            >
                {children}
            </div>
        );
    }

    private onTouchStart = (event: TouchEvent) => {
        const { callback, holdLength } = this.props;

        this.timeoutIdRef = setTimeout(callback, holdLength);

        if (isMobile) {
            event.preventDefault();
        }
    };

    private cancel = (event: TouchEvent) => {
        clearTimeout(this.timeoutIdRef);

        if (isMobile) {
            event.preventDefault();
        }
    };
}
