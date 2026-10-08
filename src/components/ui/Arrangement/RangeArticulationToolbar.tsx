/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { staffSpacePx } from "../../../core/MeasureLayout.js";
import { ScoreSymbol } from "../../../core/ScoreSymbols.js";
import { requisitions, RangeArticulationTool } from "../../../supplement/Requisitions.js";
import { HairpinIcon } from "../Note/HairpinIcon.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { GooeyGroup } from "../framework/GooeyGroup.js";
import { Label } from "../framework/Label.js";
import { ScoreSymbolView } from "../framework/ScoreSymbolView.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";

interface IRangeArticulationToolbarState {
    activeTool: RangeArticulationTool;
}

/** Floating entry point for the staff-only range-articulation placing modes. */
export class RangeArticulationToolbar extends UIComponent<ICommonUIProperties, IRangeArticulationToolbarState> {
    public constructor(props: ICommonUIProperties) {
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
        const { className } = this.props;
        const { activeTool } = this.state;

        let modeStatus: ComponentChild;
        if (activeTool !== RangeArticulationTool.None) {
            const modeCaption = activeTool === RangeArticulationTool.Hairpin
                ? "Click a note to place a hairpin"
                : "Click a note or rest to place forte";
            modeStatus = (
                <Container
                    className="rangeArticulationModeStatus"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <Label caption={modeCaption} />
                    <Button caption="Cancel" onClick={this.handleCancel} />
                </Container>
            );
        }

        return (
            <Container
                id="rangeArticulationToolbarHost"
                className={this.generateFinalClassName(["rangeArticulationSurface", className])}
                orientation={Orientation.TopDown}
                crossAlignment={ChildAlignment.End}
                {...this.dataAttributes}
            >
                <GooeyGroup className="rangeArticulationToolbar" background="var(--color-base-200)">
                    <Button
                        isDefault={activeTool === RangeArticulationTool.Hairpin}
                        data-tooltip="Draw crescendo / decrescendo hairpin"
                        onClick={this.handleHairpinClick}
                    >
                        <HairpinIcon />
                    </Button>
                    <Button
                        isDefault={activeTool === RangeArticulationTool.Forte}
                        className="forteButton"
                        data-tooltip="Place forte (f)"
                        onClick={this.handleForteClick}
                    >
                        <ScoreSymbolView symbol={ScoreSymbol.Forte} staffSpace={staffSpacePx} icon />
                    </Button>
                </GooeyGroup>
                {modeStatus}
            </Container>
        );
    }

    private handleToolChanged = (tool: RangeArticulationTool): Promise<boolean> => {
        this.setState({ activeTool: tool });

        return Promise.resolve(true);
    };

    private handleHairpinClick = (): void => {
        this.startTool(RangeArticulationTool.Hairpin);
    };

    private handleForteClick = (): void => {
        this.startTool(RangeArticulationTool.Forte);
    };

    private handleCancel = (): void => {
        void requisitions.execute("rangeArticulationToolChanged", RangeArticulationTool.None);
    };

    private startTool(tool: RangeArticulationTool): void {
        void requisitions.execute("rangeArticulationToolChanged", tool);
    }
}
