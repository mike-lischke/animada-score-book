/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createContext, type ComponentChild } from "preact";

import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";
import { OverlayState } from "./OverlayState.js";
import { requisitions } from "../../supplement/Requisitions.js";

export const OverlayStateContext = createContext<OverlayState | null>(null);

export interface IOverlayProps extends ICommonUIProperties {
    name: string;
}

interface IOverlayState {
    visibilityClass: string;
    visible: boolean;
}

export class Overlay extends UIComponent<IOverlayProps, IOverlayState> {
    private static overlayStates: Record<string, OverlayState> = {};

    private overlayState: OverlayState;

    public constructor(props: IOverlayProps) {
        super(props);

        this.overlayState = new OverlayState(props.name);

        this.state = {
            visible: false,
            visibilityClass: "invisible hidden"
        };
    }

    public static toggleOverlay(name: string, mode: "toggle" | "show" | "hide" = "toggle"): void {
        const state = this.overlayStates[name] as OverlayState | undefined;
        if (state === undefined) {
            console.warn("Toggled an overlay that wasn't registered");

            return;
        }

        if (mode === "show" || (mode === "toggle" && !state.visible)) {
            this.closeAllOverlays();
            state.visible = true;
        } else {
            state.visible = false;
        }
    }

    public static closeAllOverlays(): void {
        for (const name in this.overlayStates) {
            this.overlayStates[name].visible = false;
        }
    }

    public override componentDidMount(): void {
        const { name } = this.props;

        requisitions.register("overlayVisibilityChanged", this.handleOverlayVisibilityChanged);
        Overlay.overlayStates[name] = this.overlayState;
    }

    public override componentWillUnmount(): void {
        const { name } = this.props;

        requisitions.unregister("overlayVisibilityChanged", this.handleOverlayVisibilityChanged);
        delete Overlay.overlayStates[name];
    }

    public override render(): ComponentChild {
        const { name, children } = this.props;
        const { visibilityClass } = this.state;

        const className = `overlay ${visibilityClass}`;

        return (
            <OverlayStateContext.Provider value={this.overlayState} >
                <div
                    className={className}
                    data-overlay-name={name}
                    onTransitionEnd={this.handleTransitionEnd}
                >
                    {children}
                </div>
            </OverlayStateContext.Provider>
        );
    }

    private handleTransitionEnd = (event: TransitionEvent) => {
        const { visibilityClass } = this.state;

        const elem = event.target as HTMLElement | null;

        // Only want to catch the overlay fading.
        if (!elem?.classList.contains("overlay")) {
            return;
        }

        if (visibilityClass === "invisible") {
            this.setState({ visibilityClass: "invisible hidden" });
        }

        event.stopPropagation();
    };

    private handleOverlayVisibilityChanged = (data: { name: string; visible: boolean; }): Promise<boolean> => {
        const { name } = this.props;

        if (data.name !== name) {
            return Promise.resolve(false);
        }

        if (data.visible) {
            // First remove hidden class, so we remove display:none.
            this.setState({ visibilityClass: "invisible" });
            setTimeout(() => {
                this.setState({ visibilityClass: "visible" });
            }, 0); // Then fade in
        } else {
            this.setState({ visibilityClass: "invisible" }); // hidden class will be set after animation ends
        }

        return Promise.resolve(true);
    };
}
