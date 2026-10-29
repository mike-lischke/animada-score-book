/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type ComponentChild } from "preact";

import { staffSpacePx } from "../../../core/MeasureLayout.js";
import { ScoreSymbol } from "../../../core/ScoreSymbols.js";
import type { IPoint } from "../../../core/types/general.js";
import { requisitions, RangeArticulationTool } from "../../../supplement/Requisitions.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { Dropdown, type IDropdownItem } from "../framework/Dropdown.js";
import { FloatingBar, type IFloatingBarState } from "../framework/FloatingBar.js";
import { Icon } from "../framework/Icon.js";
import { Label } from "../framework/Label.js";
import { ScoreSymbolView } from "../framework/ScoreSymbolView.js";
import { UIIcon } from "../framework/UIIcon.js";
import type { ICommonUIProperties } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";

/** The distance the bar keeps from the overlay's right and top edges while it sits in its default place. */
const barMargin = 12;
const barTop = 6;

interface IToolsBarState extends IFloatingBarState {
    activeTool: RangeArticulationTool;

    /** True while the full bar needs more room than the overlay offers. */
    compact: boolean;
}

/** The floating bar of the staff view's placing tools, headed like the mockup's tool bar. */
export class ToolsBar extends FloatingBar<ICommonUIProperties, IToolsBarState> {
    protected readonly positionSetting = "toolsBarPosition";

    /** The visible bar, whose width states what has to fit. */
    private barRef = createRef<HTMLDivElement | null>();

    /** The hidden full-width bar, measured while the visible one is compact. */
    private probeRef = createRef<HTMLDivElement | null>();

    public constructor(props: ICommonUIProperties) {
        super(props);

        this.state = { activeTool: RangeArticulationTool.None, compact: false };
    }

    public override componentDidMount(): void {
        super.componentDidMount();
        requisitions.register("rangeArticulationToolChanged", this.handleToolChanged);
    }

    public override componentWillUnmount(): void {
        const { activeTool } = this.state;
        requisitions.unregister("rangeArticulationToolChanged", this.handleToolChanged);
        super.componentWillUnmount();

        if (activeTool !== RangeArticulationTool.None) {
            void requisitions.execute("rangeArticulationToolChanged", RangeArticulationTool.None);
        }
    }

    public override render(): ComponentChild {
        const { className } = this.props;
        const { activeTool, compact } = this.state;

        const heading = <Label className="toolsBarHeading" caption="Tools" />;
        const divider = <span className="toolsBarDivider" />;

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
                style={this.placementStyle()}
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
                    {tools}
                </Container>
                {modeStatus}
                {measureProbe}
            </Container>
        );
    }

    /**
     * @param target The element the pointer went down on.
     *
     * @returns True when that element takes the bar.
     */
    protected isDragHandle(target: HTMLElement): boolean {
        return target.closest(".toolsBarHeading") !== null;
    }

    /**
     * @param barWidth The width of the bar.
     * @param barHeight The height of the bar.
     * @param overlayWidth The width of the overlay the bar floats in.
     *
     * @returns The place the bar takes at the overlay's right end while it was not dragged.
     */
    protected defaultPlacement(barWidth: number, barHeight: number, overlayWidth: number): IPoint {
        return { x: overlayWidth - barWidth - barMargin, y: barTop };
    }

    /**
     * Fits the bar into the overlay: it folds its tools into a menu only when even the full width no longer
     * fits beside the mode bar.
     */
    protected override updateLayout(): void {
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

        // While compact, the hidden twin states the width the full bar would need. The mode bar at the overlay's
        // left end keeps its width, so the tools only stay expanded while both fit side by side.
        const bar = this.barRef.current;
        const probe = this.probeRef.current;
        const expandedWidth = probe?.offsetWidth ?? bar?.offsetWidth ?? 0;
        const modeBarWidth = overlay.querySelector<HTMLElement>("#arrangementModeBar")?.offsetWidth ?? 0;
        const compact = expandedWidth + modeBarWidth + (barMargin * 2) > overlayWidth;

        if (compact !== this.state.compact) {
            this.setState({ compact }, () => {
                this.updateLayout();
            });

            return;
        }

        super.updateLayout();
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
        void requisitions.execute("selectionEditPopupCloseRequested", undefined);
        void requisitions.execute("rangeArticulationToolChanged", RangeArticulationTool.None);
    };

    private startTool(tool: RangeArticulationTool): void {
        void requisitions.execute("selectionEditPopupCloseRequested", undefined);
        void requisitions.execute("rangeArticulationToolChanged", tool);
    }
}
