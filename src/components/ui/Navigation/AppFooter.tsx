/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild } from "preact";

import { clampValue } from "../../../core/utils.js";
import { requisitions, type INotificationState, type IScoreViewport } from "../../../supplement/Requisitions.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { Label } from "../framework/Label.js";
import { UIIcon } from "../framework/UIIcon.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ScoreNavigator } from "../Navigation/ScoreNavigator.js";

/** The smallest and largest track viewer zoom the footer offers, in percent. */
const zoomMin = 50;
const zoomMax = 150;
const zoomStep = 10;

/** The viewport reported until the viewer has measured the score. */
const initialViewport: IScoreViewport = { position: 0, width: 1, startBar: 1, endBar: 1 };

interface IAppFooterState {
    /** The score viewport the viewer last reported. */
    viewport: IScoreViewport;
}

export interface IAppFooterProps extends ICommonUIProperties {
    /** Number of measures in the arrangement. */
    barCount: number;

    /** Column widths set for individual measures, keyed by 1-based measure number. */
    measureWidths?: ReadonlyMap<number, number>;

    /** Track viewer zoom in percent. */
    zoom: number;

    /** App version, shown on the release-notes button. */
    version: string;

    /** The notification center's current summary. */
    notifications: INotificationState;

    /** Reports a new track viewer zoom in percent. */
    onZoomChange: (zoom: number) => void;

    /** Toggles the notification history. */
    onToggleNotifications: () => void;

    /** Opens the release notes. */
    onShowReleaseNotes: () => void;
}

/** The app's bottom status and navigation strip. */
export class AppFooter extends UIComponent<IAppFooterProps, IAppFooterState> {
    public constructor(props: IAppFooterProps) {
        super(props);

        this.state = { viewport: initialViewport };
    }

    public override componentDidMount(): void {
        requisitions.register("scoreViewportChanged", this.handleViewportChanged);
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("scoreViewportChanged", this.handleViewportChanged);
    }

    public override render(): ComponentChild {
        const { className, barCount, measureWidths, zoom, version, notifications } = this.props;
        const { viewport } = this.state;

        const rangeCaption = viewport.startBar === viewport.endBar
            ? `Measure ${viewport.startBar} of ${barCount}`
            : `Measures ${viewport.startBar} – ${viewport.endBar} of ${barCount}`;

        const { newCount, totalCount, silent, showHistory } = notifications;
        let notificationIcon: ComponentChild;
        if (showHistory) {
            notificationIcon = <Icon src={silent ? UIIcon.BellSlash : UIIcon.Bell} />;
        } else if (silent) {
            notificationIcon = <Icon src={newCount === 0 ? UIIcon.BellSlash : UIIcon.BellSlashDot} />;
        } else {
            notificationIcon = <Icon src={newCount === 0 ? UIIcon.Bell : UIIcon.BellDot} />;
        }

        const notificationCaption = showHistory
            ? "Hide notifications"
            : newCount === 0
                ? totalCount > 0 ? "Notifications" : "No notifications"
                : `${newCount} new notification${newCount > 1 ? "s" : ""}`;

        return (
            <Container
                className={this.generateFinalClassName(["appFooter", className])}
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
                {...this.dataAttributes}
            >
                <Label className="appFooterRange" caption={rangeCaption} />
                <ScoreNavigator
                    className="appFooterNavigator"
                    barCount={barCount}
                    measureWidths={measureWidths}
                    viewport={viewport}
                    onMove={this.handleNavigatorMove}
                />
                <Container
                    className="appFooterActions"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <Button
                        compact
                        className="appFooterZoomButton"
                        caption="-"
                        data-tooltip="Zoom out"
                        disabled={zoom <= zoomMin}
                        onClick={this.handleZoomOut}
                    />
                    <Label className="appFooterZoomValue" caption={`${zoom}%`} />
                    <Button
                        compact
                        className="appFooterZoomButton"
                        caption="+"
                        data-tooltip="Zoom in"
                        disabled={zoom >= zoomMax}
                        onClick={this.handleZoomIn}
                    />
                    <Button
                        compact
                        className="appFooterVersionButton"
                        caption={`v${version}`}
                        data-tooltip="Release Notes"
                        onClick={this.props.onShowReleaseNotes}
                    />
                    <Button
                        id="showNotificationHistory"
                        compact
                        imageOnly
                        className="appFooterNotificationButton"
                        data-tooltip={notificationCaption}
                        onClick={this.props.onToggleNotifications}
                    >
                        {notificationIcon}
                    </Button>
                </Container>
            </Container>
        );
    }

    private handleZoomOut = (): void => {
        this.props.onZoomChange(clampValue(this.props.zoom - zoomStep, zoomMin, zoomMax));
    };

    private handleZoomIn = (): void => {
        this.props.onZoomChange(clampValue(this.props.zoom + zoomStep, zoomMin, zoomMax));
    };

    private handleViewportChanged = (viewport: IScoreViewport): Promise<boolean> => {
        const current = this.state.viewport;
        if (current.position === viewport.position && current.width === viewport.width
            && current.startBar === viewport.startBar && current.endBar === viewport.endBar) {
            return Promise.resolve(true);
        }

        this.setState({ viewport });

        return Promise.resolve(true);
    };

    private handleNavigatorMove = (position: number): void => {
        void requisitions.execute("scoreViewportMoveRequested", position);
    };
}
