/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type ComponentChild, type CSSProperties } from "preact";

import { AppStorage } from "../../../core/AppStorage.js";
import { staffSpacePx } from "../../../core/MeasureLayout.js";
import { ScoreSymbol } from "../../../core/ScoreSymbols.js";
import type { EditEntryMode, IPoint } from "../../../core/types/general.js";
import { clampValue } from "../../../core/utils.js";
import { requisitions, RangeArticulationTool } from "../../../supplement/Requisitions.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { Dropdown, type IDropdownItem } from "../framework/Dropdown.js";
import { Icon } from "../framework/Icon.js";
import { Label } from "../framework/Label.js";
import { ScoreSymbolView } from "../framework/ScoreSymbolView.js";
import { UIIcon } from "../framework/UIIcon.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { EntryModeButton } from "./EntryModeButton.js";

/** The distance the bar keeps from the overlay's right and top edges while it sits in its default place. */
const barMargin = 12;
const barTop = 6;

interface IToolsBarState {
    activeTool: RangeArticulationTool;

    /** Where the bar was dragged to, in px inside the overlay it floats in. Absent means its default place. */
    position?: IPoint;

    /** True while the full bar needs more room than the overlay offers. */
    compact: boolean;

    /** Where the bar is drawn, clamped to the room the overlay offers. */
    placement?: IPoint;
}

export interface IToolsBarProps extends ICommonUIProperties {
    /**
     * The entry mode in effect. Omitted means the app states no mode, so the bar offers no entry switch — the
     * only place insert and overwrite can be told apart.
     */
    entryMode?: EditEntryMode;
}

/** The floating bar of the staff view's placing tools, headed like the mockup's tool bar. */
export class ToolsBar extends UIComponent<IToolsBarProps, IToolsBarState> {
    /** The bar's own element, whose place a drag states and whose area bounds the drag. */
    private hostRef = createRef<HTMLDivElement | null>();

    /** The visible bar, whose width states what has to fit. */
    private barRef = createRef<HTMLDivElement | null>();

    /** The hidden full-width bar, measured while the visible one is compact. */
    private probeRef = createRef<HTMLDivElement | null>();

    /** Watches the overlay and the bar, so a resize re-fits the bar. */
    private resizeObserver?: ResizeObserver;

    /** The pointer the running drag belongs to, absent while the bar stays put. */
    private dragPointerId?: number;

    /** Offset from the bar's top-left corner to the pointer, as taken when the drag started. */
    private dragOffset: IPoint = { x: 0, y: 0 };

    /** The areas of the overlay's other surfaces, taken when the drag starts: the bar keeps them free. */
    private obstacles: DOMRect[] = [];

    public constructor(props: IToolsBarProps) {
        super(props);

        this.state = { activeTool: RangeArticulationTool.None, compact: false };
    }

    public override componentDidMount(): void {
        requisitions.register("rangeArticulationToolChanged", this.handleToolChanged);
        this.restorePosition();
        this.observeLayout();
        this.updateLayout();
    }

    public override componentWillUnmount(): void {
        const { activeTool } = this.state;
        requisitions.unregister("rangeArticulationToolChanged", this.handleToolChanged);
        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
        this.endDrag();

        if (activeTool !== RangeArticulationTool.None) {
            void requisitions.execute("rangeArticulationToolChanged", RangeArticulationTool.None);
        }
    }

    public override render(): ComponentChild {
        const { className, entryMode } = this.props;
        const { activeTool, compact, placement } = this.state;

        const heading = <Label className="toolsBarHeading" caption="Tools" />;
        const divider = <span className="toolsBarDivider" />;

        // The entry switch heads the bar: insert mode draws no selection, so without a switch out here the
        // mode could not be left again in the staff view.
        let entrySwitch: ComponentChild;
        if (entryMode !== undefined) {
            entrySwitch = (
                <>
                    <EntryModeButton entryMode={entryMode} />
                    <span className="toolsBarDivider" />
                </>
            );
        }

        const expandedTools = <>
            {this.renderTool(RangeArticulationTool.Crescendo, "Draw a crescendo hairpin",
                "Crescendo", <Icon src={UIIcon.ChevronLeft} />)}
            {this.renderTool(RangeArticulationTool.Decrescendo, "Draw a decrescendo hairpin",
                "Decrescendo", <Icon src={UIIcon.ChevronRight} />)}
            {this.renderTool(RangeArticulationTool.Forte, "Place forte (f)", "Forte",
                <ScoreSymbolView symbol={ScoreSymbol.Forte} staffSpace={staffSpacePx} icon />)}
        </>;

        let tools: ComponentChild = expandedTools;
        if (compact) {
            tools = this.renderOverflowTools();
        }

        // While the bar is compact, this invisible twin states the width the full bar would need.
        let measureProbe: ComponentChild;
        if (compact) {
            measureProbe = <div className="toolsBarMeasure" aria-hidden="true">
                <Container
                    className="tools-bar"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                    gap={8}
                    innerRef={this.probeRef}
                >
                    {heading}
                    {divider}
                    {entrySwitch}
                    {expandedTools}
                </Container>
            </div>;
        }

        let modeStatus: ComponentChild;
        if (activeTool !== RangeArticulationTool.None) {
            modeStatus = (
                <Container
                    className="tools-mode-status"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <span className="tools-mode-status-dot" />
                    <Label caption={this.modeCaption(activeTool)} />
                    <Button caption="Cancel" onClick={this.handleCancel} />
                </Container>
            );
        }

        return (
            <Container
                id="toolsBarHost"
                className={this.generateFinalClassName(["toolsBarSurface", className])}
                orientation={Orientation.TopDown}
                crossAlignment={ChildAlignment.End}
                innerRef={this.hostRef}
                style={ToolsBar.placementStyle(placement)}
                onPointerDown={this.handlePointerDown}
                {...this.dataAttributes}
            >
                <Container
                    className="tools-bar"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                    gap={8}
                    innerRef={this.barRef}
                >
                    {heading}
                    {divider}
                    {entrySwitch}
                    {tools}
                </Container>
                {modeStatus}
                {measureProbe}
            </Container>
        );
    }

    /**
     * @param position Where the bar was dragged to, in px inside the overlay.
     *
     * @returns The style that places the bar, or undefined while it sits in its default place.
     */
    private static placementStyle(position?: IPoint): CSSProperties | undefined {
        if (position === undefined) {
            return undefined;
        }

        // A place the bar was dragged to replaces the default one at the overlay's right edge.
        return { left: `${position.x}px`, top: `${position.y}px`, right: "auto" };
    }

    /**
     * @param position The position the pointer states, in px inside the overlay.
     * @param bar The area the bar takes.
     * @param overlay The area of the overlay the bar floats in.
     *
     * @returns The position the bar can take, as close to the stated one as the overlay allows.
     */
    private static clampPlacement(position: IPoint, bar: DOMRect, overlay: DOMRect): IPoint {
        return {
            x: clampValue(position.x, 0, Math.max(0, overlay.width - bar.width)),
            y: clampValue(position.y, 0, Math.max(0, overlay.height - bar.height)),
        };
    }

    /**
     * @param position The place inside the overlay.
     * @param bar The area the bar takes.
     * @param overlay The area of the overlay the bar floats in.
     *
     * @returns The area the place covers, in viewport coordinates.
     */
    private static areaAt(position: IPoint, bar: DOMRect, overlay: DOMRect): DOMRect {
        const left = overlay.left + position.x;
        const top = overlay.top + position.y;

        return {
            x: left,
            y: top,
            width: bar.width,
            height: bar.height,
            top,
            right: left + bar.width,
            bottom: top + bar.height,
            left,
            toJSON: () => {
                return {};
            },
        };
    }

    /**
     * @param overlay The overlay the bar floats in.
     * @param host The bar's own element, which is no obstacle to itself.
     *
     * @returns The areas of the overlay's other surfaces, in viewport coordinates.
     */
    private static obstaclesIn(overlay: HTMLElement, host: HTMLElement): DOMRect[] {
        const obstacles: DOMRect[] = [];

        for (const sibling of overlay.children) {
            // A readout the pointer passes through is no obstacle, only a surface the user works with is.
            if (sibling === host || !(sibling instanceof HTMLElement)
                || getComputedStyle(sibling).pointerEvents === "none") {
                continue;
            }

            const rect = sibling.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                obstacles.push(rect);
            }
        }

        return obstacles;
    }

    /**
     * @param place The area the bar would take, in viewport coordinates.
     * @param obstacles The areas the bar has to keep free.
     *
     * @returns True when the area covers one of them.
     */
    private static coversObstacle(place: DOMRect, obstacles: DOMRect[]): boolean {
        return obstacles.some((rect) => {
            return place.left < rect.right && place.right > rect.left
                && place.top < rect.bottom && place.bottom > rect.top;
        });
    }

    /** Watches the surfaces whose size decides the bar's place and mode. */
    private observeLayout(): void {
        const host = this.hostRef.current;
        const overlay = host?.offsetParent;
        if (typeof ResizeObserver === "undefined" || host === null || !(overlay instanceof HTMLElement)) {
            return;
        }

        this.resizeObserver = new ResizeObserver(this.updateLayout);
        this.resizeObserver.observe(overlay);
        this.resizeObserver.observe(host);
    }

    /**
     * Fits the bar into the overlay: it moves left until it reaches the edge, and folds its tools into a menu
     * only when even the full width no longer fits.
     */
    private updateLayout = (): void => {
        const host = this.hostRef.current;
        const overlay = host?.offsetParent;
        if (host === null || !(overlay instanceof HTMLElement)) {
            return;
        }

        const overlayWidth = overlay.clientWidth;
        const overlayHeight = overlay.clientHeight;
        if (overlayWidth === 0 || overlayHeight === 0) {
            return;
        }

        // While compact, the hidden twin states the width the full bar would need.
        const bar = this.barRef.current;
        const probe = this.probeRef.current;
        const expandedWidth = probe?.offsetWidth ?? bar?.offsetWidth ?? 0;
        const compact = expandedWidth > overlayWidth;

        if (compact !== this.state.compact) {
            this.setState({ compact }, this.updateLayout);

            return;
        }

        const width = host.offsetWidth;
        const height = host.offsetHeight;
        if (width === 0 || height === 0) {
            return;
        }

        const { position } = this.state;
        const placement = {
            x: clampValue(position?.x ?? overlayWidth - width - barMargin, 0, Math.max(0, overlayWidth - width)),
            y: clampValue(position?.y ?? barTop, 0, Math.max(0, overlayHeight - height)),
        };

        const current = this.state.placement;
        if (current?.x !== placement.x || current.y !== placement.y) {
            this.setState({ placement });
        }
    };

    /**
     * Starts a drag when the pointer goes down on the band around the bar's title. The controls of the bar keep
     * working, so that band is the only place the bar can be taken by.
     *
     * @param event The pointer event the bar received.
     */
    private handlePointerDown = (event: PointerEvent): void => {
        const host = this.hostRef.current;
        const overlay = host?.offsetParent ?? null;
        const target = event.target;
        const handle = target instanceof HTMLElement ? target.closest<HTMLElement>(".toolsBarHeading") : null;
        if (host === null || handle === null || !(overlay instanceof HTMLElement)) {
            return;
        }

        const hostRect = host.getBoundingClientRect();
        this.dragOffset = { x: event.clientX - hostRect.left, y: event.clientY - hostRect.top };
        this.dragPointerId = event.pointerId;
        this.obstacles = ToolsBar.obstaclesIn(overlay, host);

        // Capturing keeps the score from reacting to the pointer while the bar is on the move.
        handle.setPointerCapture(event.pointerId);
        document.addEventListener("pointermove", this.handlePointerMove);
        document.addEventListener("pointerup", this.handleDragEnd);
        document.addEventListener("pointercancel", this.handleDragEnd);

        event.preventDefault();
    };

    private handlePointerMove = (event: PointerEvent): void => {
        if (event.pointerId !== this.dragPointerId) {
            return;
        }

        const host = this.hostRef.current;
        const overlay = host?.offsetParent ?? null;
        if (host === null || !(overlay instanceof HTMLElement)) {
            return;
        }

        const hostRect = host.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();

        // The bar keeps the offset the pointer took it at and the stated place is what the clamp makes of it.
        const position = ToolsBar.clampPlacement({
            x: event.clientX - this.dragOffset.x - overlayRect.left,
            y: event.clientY - this.dragOffset.y - overlayRect.top,
        }, hostRect, overlayRect);

        const place = ToolsBar.areaAt(position, hostRect, overlayRect);
        if (ToolsBar.coversObstacle(place, this.obstacles)) {
            return;
        }

        this.setState({ position, placement: position });
        event.preventDefault();
    };

    private handleDragEnd = (event: PointerEvent): void => {
        if (event.pointerId !== this.dragPointerId) {
            return;
        }

        const { position } = this.state;
        this.endDrag();

        if (position !== undefined) {
            AppStorage.saveSetting("toolsBarPosition", position);
        }
    };

    /** Ends the running drag: the bar no longer follows a pointer and its listeners are gone. */
    private endDrag(): void {
        this.dragPointerId = undefined;
        document.removeEventListener("pointermove", this.handlePointerMove);
        document.removeEventListener("pointerup", this.handleDragEnd);
        document.removeEventListener("pointercancel", this.handleDragEnd);
    }

    /**
     * Puts the bar where the last drag left it. A place the overlay no longer offers — the window shrank, a
     * surface now covers it — is dropped, so the bar falls back to its default place.
     */
    private restorePosition(): void {
        const stored = AppStorage.loadUISettings()?.toolsBarPosition;
        const host = this.hostRef.current;
        const overlay = host?.offsetParent ?? null;
        if (stored === undefined || host === null || !(overlay instanceof HTMLElement)) {
            return;
        }

        const hostRect = host.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();
        const clamped = ToolsBar.clampPlacement(stored, hostRect, overlayRect);
        const place = ToolsBar.areaAt(clamped, hostRect, overlayRect);
        if (ToolsBar.coversObstacle(place, ToolsBar.obstaclesIn(overlay, host))) {
            return;
        }

        // The stored place stays the preference; the layout clamps it again when the overlay is smaller now.
        this.setState({ position: stored });
    }

    /**
     * Renders the bar's tools as menu entries.
     *
     * @returns The overflow menu.
     */
    private renderOverflowTools(): ComponentChild {
        const { activeTool } = this.state;

        const items: IDropdownItem[] = [
            {
                label: "Crescendo",
                icon: <Icon src={UIIcon.ChevronLeft} />,
                detail: activeTool === RangeArticulationTool.Crescendo ? "On" : undefined,
                onClick: () => {
                    this.startTool(RangeArticulationTool.Crescendo);
                },
            },
            {
                label: "Decrescendo",
                icon: <Icon src={UIIcon.ChevronRight} />,
                detail: activeTool === RangeArticulationTool.Decrescendo ? "On" : undefined,
                onClick: () => {
                    this.startTool(RangeArticulationTool.Decrescendo);
                },
            },
            {
                label: "Forte",
                icon: <ScoreSymbolView symbol={ScoreSymbol.Forte} staffSpace={staffSpacePx} icon />,
                detail: activeTool === RangeArticulationTool.Forte ? "On" : undefined,
                onClick: () => {
                    this.startTool(RangeArticulationTool.Forte);
                },
            },
        ];

        let statusDot: ComponentChild;
        if (activeTool !== RangeArticulationTool.None) {
            statusDot = <span className="toolsBarOverflowDot" />;
        }

        const icon = <span className="toolsBarOverflowIcon">
            <Icon src={UIIcon.Ellipsis} />
            {statusDot}
        </span>;

        return <Dropdown
            className="toolsBarOverflowMenu"
            icon={icon}
            title="Placing tools"
            items={items}
            closeOnSelect
        />;
    }

    /**
     * Renders one of the bar's tools. The active tool carries a status dot, the way the mockup marks it.
     *
     * @param tool The tool the button starts.
     * @param tooltip The text the tooltip shows.
     * @param caption The caption of the button.
     * @param icon The icon of the button.
     *
     * @returns The tool button.
     */
    private renderTool(tool: RangeArticulationTool, tooltip: string, caption: string,
        icon: ComponentChild): ComponentChild {
        const { activeTool } = this.state;

        const active = activeTool === tool;
        const className = this.generateFinalClassName([
            "toolsBarTool",
            this.classFromProperty(active, "is-active"),
        ]);

        const status = active ? <span className="toolsBarToolDot" /> : undefined;

        return (
            <Button className={className} title={tooltip} onClick={() => {
                this.startTool(tool);
            }}>
                {icon}
                <Label className="toolsBarToolCaption" caption={caption} />
                {status}
            </Button>
        );
    }

    /**
     * @param tool The active tool.
     *
     * @returns The hint the status shows for that tool.
     */
    private modeCaption(tool: RangeArticulationTool): string {
        switch (tool) {
            case RangeArticulationTool.Crescendo: {
                return "Click a note to place a crescendo";
            }

            case RangeArticulationTool.Decrescendo: {
                return "Click a note to place a decrescendo";
            }

            default: {
                return "Click a note or rest to place forte";
            }
        }
    }

    private handleToolChanged = (tool: RangeArticulationTool): Promise<boolean> => {
        this.setState({ activeTool: tool });

        return Promise.resolve(true);
    };

    private handleCancel = (): void => {
        void requisitions.execute("rangeArticulationToolChanged", RangeArticulationTool.None);
    };

    private startTool(tool: RangeArticulationTool): void {
        void requisitions.execute("rangeArticulationToolChanged", tool);
    }
}
