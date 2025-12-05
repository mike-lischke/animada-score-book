/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild, ContextType } from "preact";

import type { EditCommand_TimeParamsTimeSignature } from "../../../core/types/edit_commands.js";
import type { IArrangementView } from "../../../core/types/general.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { NumberInput } from "../NumberInput.js";
import { AnimadaScoreBookContext } from "../ScoreBookViewer.js";

export interface ITimeControlsProps extends ICommonUIProperties {
    arrangement: IArrangementView;
}

export class TimeControls extends UIComponent<ITimeControlsProps> {
    private scoreBookContext?: ContextType<typeof AnimadaScoreBookContext>;

    public override render(): ComponentChild {
        const { arrangement } = this.props;
        const pluralBars = arrangement.timeParams.length > 1;

        return (
            <AnimadaScoreBookContext.Consumer>
                {(scoreBookContext) => {
                    this.scoreBookContext = scoreBookContext;

                    return (
                        <div className="time-controls-wrapper" >
                            <div className="time-control">
                                <select
                                    className="short"
                                    onInput={this.changeTimeSignature}
                                    value={arrangement.timeParams.timeSignature}>
                                    <option>4/4</option>
                                    <option>6/8</option>
                                    <option>5/4</option>
                                    <option>7/8</option>
                                </select> time
                            </div>
                            <div className="time-control">
                                <NumberInput
                                    getValue={() => {
                                        return String(arrangement.timeParams.tempo);
                                    }}
                                    setValue={(newValue: string) => {
                                        scoreBookContext?.edit({
                                            type: "EditCommand_TimeParamsTempo",
                                            timeParams: arrangement.timeParams,
                                            tempo: Number(newValue)
                                        });
                                    }}
                                    subscribable={arrangement.timeParams}
                                /> bpm
                            </div>
                            <div className="time-control">
                                <NumberInput
                                    getValue={() => {
                                        return String(arrangement.timeParams.length);
                                    }}
                                    setValue={(newValue: string) => {
                                        scoreBookContext?.edit({
                                            type: "EditCommand_TimeParamsLength",
                                            timeParams: arrangement.timeParams,
                                            length: Number(newValue)
                                        });
                                    }}
                                    subscribable={arrangement.timeParams}
                                /> {pluralBars ? "bars" : "bar"}
                            </div>
                        </div>
                    );
                }}
            </AnimadaScoreBookContext.Consumer>
        );
    }

    private changeTimeSignature = (event: InputEvent) => {
        const { arrangement } = this.props;

        const command: Partial<EditCommand_TimeParamsTimeSignature> = {
            type: "EditCommand_TimeParamsTimeSignature", timeParams: arrangement.timeParams
        };

        command.timeSignature = (event.target as HTMLInputElement).value;
        switch ((event.target as HTMLInputElement).value) {
            case "4/4":
                command.stepResolution = 16;
                command.pulse = "1/4";
                break;
            case "6/8":
                command.stepResolution = 8;
                command.pulse = "3/8";
                break;
            case "5/4":
                command.stepResolution = 8;
                command.pulse = "1/2";
                break;
            case "7/8":
                command.stepResolution = 8;
                command.pulse = "1/2";
                break;
        }

        this.scoreBookContext?.edit(command as EditCommand_TimeParamsTimeSignature);
    };

}
