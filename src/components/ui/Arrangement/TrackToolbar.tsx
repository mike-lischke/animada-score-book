/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild, createRef } from "preact";

import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { Popup } from "../framework/Popup.js";
import { UIIcon } from "../framework/UIIcon.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { ComponentPlacement, UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface ITrackToolbarItem {
    id: string;
    tooltip?: string;
    icon: ComponentChild;
    disabled?: boolean;

    /** Marks an action that destroys track content, which the toolbar draws as the dangerous one. */
    destructive?: boolean;
    onClick?: () => void;
}

export interface ITrackToolbarOptions {
    /** The toolbar's heading, usually the name of the track's instrument. */
    title: string;

    /** Color of the dot that marks which track the toolbar belongs to. */
    color?: string;

    items: ITrackToolbarItem[];
}

interface ITrackToolbarState {
    options?: ITrackToolbarOptions;
}

/**
 * Floating toolbar carrying the actions of one track. It slides in beside the track's action button and
 * closes on Escape, on a click outside it, and when its anchor goes away with the track.
 */
export class TrackToolbar extends UIComponent<ICommonUIProperties, ITrackToolbarState> {
    public override state: ITrackToolbarState = {};

    private popupRef = createRef<Popup | null>();

    public open(anchor: HTMLElement, options: ITrackToolbarOptions): void {
        this.setState({ options }, () => {
            this.popupRef.current?.open(anchor);
        });
    }

    public override render(): ComponentChild {
        const { id } = this.props;

        return (
            <Popup
                id={id}
                ref={this.popupRef}
                className={this.generateFinalClassName(["track-toolbar"])}
                placement={ComponentPlacement.LeftCenter}
                offset={8}
                showArrow={false}
                onClose={this.handlePopupClosed}
            >
                {this.renderContent()}
            </Popup>
        );
    }

    /**
     * Builds the toolbar card, which stays empty while the toolbar is closed.
     *
     * @returns The toolbar's content.
     */
    private renderContent(): ComponentChild {
        const { options } = this.state;
        if (options === undefined) {
            return undefined;
        }

        const header = (
            <Container className="trackToolbarHeader" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <span className="trackToolbarDot" style={{ backgroundColor: options.color }} />
                <span className="trackToolbarTitle">{options.title}</span>
                <Button className="trackToolbarClose" title="Close" onClick={this.handleCloseClick}>
                    <Icon src={UIIcon.Close} width={16} height={16} />
                </Button>
            </Container>
        );

        const actions = options.items.map((item) => {
            const className = item.destructive === true
                ? "trackToolbarAction is-destructive"
                : "trackToolbarAction";

            return (
                <Button
                    key={item.id}
                    className={className}
                    title={item.tooltip}
                    disabled={item.disabled}
                    onClick={() => {
                        item.onClick?.();
                        this.close();
                    }}
                >
                    {item.icon}
                </Button>
            );
        });

        return (
            <>
                {header}
                <div className="trackToolbarSection">Actions</div>
                <Container className="trackToolbarActions" orientation={Orientation.LeftToRight}>
                    {actions}
                </Container>
            </>
        );
    }

    private close(): void {
        this.popupRef.current?.close(false);
    }

    private handleCloseClick = (): void => {
        this.close();
    };

    private handlePopupClosed = (): void => {
        this.setState({ options: undefined });
    };
}
