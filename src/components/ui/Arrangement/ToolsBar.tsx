/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import { staffSpacePx } from "../../../core/MeasureLayout.js";
import { ScoreSymbol } from "../../../core/ScoreSymbols.js";
import type { EditEntryMode } from "../../../core/types/general.js";
import { requisitions, RangeArticulationTool } from "../../../supplement/Requisitions.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { Label } from "../framework/Label.js";
import { ScoreSymbolView } from "../framework/ScoreSymbolView.js";
import { UIIcon } from "../framework/UIIcon.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { EntryModeButton } from "./EntryModeButton.js";

interface IToolsBarState {
    activeTool: RangeArticulationTool;
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
    public constructor(props: IToolsBarProps) {
        super(props);

        this.state = { activeTool: RangeArticulationTool.None };
    }

    public override componentDidMount(): void {
        requisitions.register("rangeArticulationToolChanged", this.handleToolChanged);
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("rangeArticulationToolChanged", this.handleToolChanged);

        if (this.state.activeTool !== RangeArticulationTool.None) {
            void requisitions.execute("rangeArticulationToolChanged", RangeArticulationTool.None);
        }
    }

    public override render(): ComponentChild {
        const { className, entryMode } = this.props;
        const { activeTool } = this.state;

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

        const crescendoTool = this.renderTool(RangeArticulationTool.Crescendo, "Draw a crescendo hairpin",
            "Crescendo", <Icon src={UIIcon.ChevronLeft} />);
        const decrescendoTool = this.renderTool(RangeArticulationTool.Decrescendo, "Draw a decrescendo hairpin",
            "Decrescendo", <Icon src={UIIcon.ChevronRight} />);
        const forteTool = this.renderTool(RangeArticulationTool.Forte, "Place forte (f)", "Forte",
            <ScoreSymbolView symbol={ScoreSymbol.Forte} staffSpace={staffSpacePx} icon />);

        let modeStatus: ComponentChild;
        if (activeTool !== RangeArticulationTool.None) {
            modeStatus = (
                <Container
                    className="toolsModeStatus"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <span className="toolsModeStatusDot" />
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
                {...this.dataAttributes}
            >
                <Container
                    className="toolsBar"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                    gap={8}
                >
                    {heading}
                    {divider}
                    {entrySwitch}
                    {crescendoTool}
                    {decrescendoTool}
                    {forteTool}
                </Container>
                {modeStatus}
            </Container>
        );
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
