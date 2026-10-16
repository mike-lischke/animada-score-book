/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild, createRef } from "preact";

import { Popup } from "../framework/Popup.js";
import { ComponentPlacement, type ICommonUIProperties } from "../framework/UIComponent.js";
import {
    SelectionToolbar, type ISelectionToolbarAction, type ISelectionToolbarSection, type ISelectionToolbarTitle,
} from "./SelectionToolbar.js";

export interface ITrackToolbarOptions {
    /** The toolbar's heading, usually the name of the track's instrument. */
    title: string;

    /** Color of the dot that marks which track the toolbar belongs to. */
    color?: string;

    items: ISelectionToolbarAction[];
}

interface ITrackToolbarState {
    options?: ITrackToolbarOptions;
}

/**
 * Floating toolbar carrying the actions of one track. It slides in beside the track's action button and
 * closes on Escape, on a click outside it, and when its anchor goes away with the track.
 */
export class TrackToolbar extends SelectionToolbar<ICommonUIProperties, ITrackToolbarState> {
    public override state: ITrackToolbarState = {};

    private popupRef = createRef<Popup | null>();

    public open(anchor: HTMLElement, options: ITrackToolbarOptions): void {
        this.setState({ options }, () => {
            this.popupRef.current?.open(anchor);
        });
    }

    protected override get toolbarTitle(): ISelectionToolbarTitle {
        const { options } = this.state;

        return { instrument: options?.title ?? "", color: options?.color };
    }

    /**
     * Running an action is what the toolbar was opened for, so it goes away with it.
     *
     * @returns The actions of the track the toolbar was opened for, in one tray.
     */
    protected override get toolbarSections(): ISelectionToolbarSection[] {
        const { options } = this.state;
        const items = options?.items ?? [];

        const actions = items.map((item) => {
            return {
                ...item,
                onClick: () => {
                    item.onClick?.();
                    this.close();
                },
            };
        });

        return [{ actions }];
    }

    protected override renderSurface(card: ComponentChild): ComponentChild {
        const { id } = this.props;

        return (
            <Popup
                id={id}
                ref={this.popupRef}
                className={this.generateFinalClassName([SelectionToolbar.surfaceClassName, "track-toolbar"])}
                placement={ComponentPlacement.LeftCenter}
                offset={8}
                showArrow={false}
                onClose={this.handlePopupClosed}
            >
                {card}
            </Popup>
        );
    }

    private close(): void {
        this.popupRef.current?.close(false);
    }

    private handlePopupClosed = (): void => {
        this.setState({ options: undefined });
    };
}
