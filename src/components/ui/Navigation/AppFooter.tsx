/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild } from "preact";

import { clampValue } from "../../../core/utils.js";
import { requisitions, type INotificationState, type IScoreViewport } from "../../../supplement/Requisitions.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { Dropdown, type IDropdownItem } from "../framework/Dropdown.js";
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
const zoomDefault = 100;

/** The viewport reported until the viewer has measured the score. */
const initialViewport: IScoreViewport = { position: 0, width: 1, startBar: 1, endBar: 1 };

interface IAppFooterState {
    /** The score viewport the viewer last reported. */
    viewport: IScoreViewport;
}

export interface IAppFooterProps extends ICommonUIProperties {
    /** Number of measures in the arrangement. */
    barCount: number;

    /** Track viewer zoom in percent. */
    zoom: number;

    /** True when the footer folds zoom and version into a menu. */
    compact?: boolean;

    zenMode?: boolean;
    onToggleZenMode?: () => void;

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
        const { className, barCount, zoom, version, notifications, compact = false, zenMode, onToggleZenMode,
            onShowReleaseNotes, onToggleNotifications } = this.props;
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

        let newCountBadge: ComponentChild;
        if (newCount > 0) {
            newCountBadge = <span className="appFooterNotificationBadge">{newCount}</span>;
        }

        let zoomGroup: ComponentChild;
        let versionSection: ComponentChild;
        if (compact) {
            versionSection = this.renderOverflow();
        } else {
            zoomGroup = <Container
                className="appFooterZoom"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
            >
                <Button
                    className="appFooterZoomButton"
                    title="Zoom out"
                    disabled={zoom <= zoomMin}
                    onClick={this.handleZoomOut}
                >
                    <Icon src={UIIcon.HorizontalRule} />
                </Button>
                <Label className="appFooterZoomValue" caption={`${zoom}%`} />
                <Button
                    className="appFooterZoomButton"
                    title="Zoom in"
                    disabled={zoom >= zoomMax}
                    onClick={this.handleZoomIn}
                >
                    <Icon src={UIIcon.Add} />
                </Button>
            </Container>;

            versionSection = <>
                <span className="appFooterDivider" />
                <Button
                    className="appFooterVersionButton"
                    caption={`v${version}`}
                    title="Release Notes"
                    onClick={onShowReleaseNotes}
                />
            </>;
        }

        return (
            <Container
                id="appFooter"
                className={this.generateFinalClassName(["appFooter", className])}
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
                {...this.dataAttributes}
            >
                <Label className="appFooterRange" caption={rangeCaption} />
                <ScoreNavigator
                    className="appFooterNavigator"
                    viewport={viewport}
                    onMove={this.handleNavigatorMove}
                />
                <Container
                    className="appFooterActions"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    {zoomGroup}
                    <Button
                        id="zenModeButton"
                        className="appFooterZenButton"
                        title={zenMode ? "Exit Zen mode" : "Enter Zen mode"}
                        aria-pressed={zenMode ?? false}
                        onClick={onToggleZenMode}
                    >
                        <Icon src={zenMode ? UIIcon.ScreenNormal : UIIcon.ScreenFull} />
                    </Button>
                    {versionSection}
                    <Button
                        id="showNotificationHistory"
                        className="appFooterNotificationButton"
                        title={notificationCaption}
                        onClick={onToggleNotifications}
                    >
                        {notificationIcon}
                        {newCountBadge}
                    </Button>
                </Container>
            </Container>
        );
    }

    /**
     * Renders the zoom steps and the version as menu entries.
     *
     * @returns The overflow menu.
     */
    private renderOverflow(): ComponentChild {
        const { zoom, version, onZoomChange, onShowReleaseNotes } = this.props;

        const items: IDropdownItem[] = [
            {
                label: "Zoom out",
                icon: <Icon src={UIIcon.ZoomOut} />,
                disabled: zoom <= zoomMin,
                onClick: this.handleZoomOut,
            },
            {
                label: "Zoom in",
                icon: <Icon src={UIIcon.ZoomIn} />,
                disabled: zoom >= zoomMax,
                onClick: this.handleZoomIn,
            },
            {
                label: "Reset zoom",
                icon: <Icon src={UIIcon.Refresh} />,
                detail: `${zoom}%`,
                onClick: () => {
                    onZoomChange(zoomDefault);
                },
            },
            {
                label: `Version ${version}`,
            },
            {
                label: "Release Notes",
                icon: <Icon src={UIIcon.Info} />,
                onClick: () => {
                    // The menu stays open for repeated zoom steps, so it closes itself before the notes open.
                    document.querySelector<HTMLElement>(".footerOverflowMenu .dropdown-popup")?.hidePopover();
                    onShowReleaseNotes();
                },
            },
        ];

        return <Dropdown
            className="footerOverflowMenu"
            icon={<Icon src={UIIcon.Ellipsis} />}
            title="More footer actions"
            items={items}
        />;
    }

    private handleZoomOut = (): void => {
        const { onZoomChange, zoom } = this.props;

        onZoomChange(clampValue(zoom - zoomStep, zoomMin, zoomMax));
    };

    private handleZoomIn = (): void => {
        const { onZoomChange, zoom } = this.props;

        onZoomChange(clampValue(zoom + zoomStep, zoomMin, zoomMax));
    };

    private handleViewportChanged = (viewport: IScoreViewport): Promise<boolean> => {
        const { viewport: current } = this.state;
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
