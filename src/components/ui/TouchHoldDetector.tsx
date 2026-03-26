/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { type ComponentChild } from "preact";

import { isMobile } from "../../ui/index.js";
import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";

export interface ITouchHoldDetectorProps extends ICommonUIProperties {
    callback: () => void;
    holdLength: number;
}

export class TouchHoldDetector extends UIComponent<ITouchHoldDetectorProps> {
    private timeoutIdRef: ReturnType<typeof setTimeout> | null = null;

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
        if (this.timeoutIdRef) {
            clearTimeout(this.timeoutIdRef);
        }

        if (isMobile) {
            event.preventDefault();
        }
    };
}
