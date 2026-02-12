/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { EditCommand_TimeParamsTimeSignature } from "../../../core/types/edit_commands.js";
import type { IArrangement } from "../../../core/types/general.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import { Container } from "../framework/Container.js";
import { ChildAlignment } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { UpDown } from "../framework/UpDown.js";

export interface ITimeControlsProps extends ICommonUIProperties {
    arrangementView: Readonly<IArrangement>;
    undoManager: UndoManager;
}

export class TimeControls extends UIComponent<ITimeControlsProps> {
    public override render(): ComponentChild {
        const { arrangementView, undoManager } = this.props;
        const pluralBars = arrangementView.timeParams.length > 1;

        return (
            <div className="time-controls-wrapper" >
                <Container className="time-control" crossAlignment={ChildAlignment.Center}>
                    <select
                        id="time-signature-select"
                        className="short"
                        onInput={this.changeTimeSignature}
                        value={arrangementView.timeParams.timeSignature}>
                        <option>4/4</option>
                        <option>6/8</option>
                        <option>5/4</option>
                        <option>7/8</option>
                    </select><span>time</span>
                </Container>
                <Container className="time-control" crossAlignment={ChildAlignment.Center}>
                    <UpDown
                        id="tempo-input"
                        value={arrangementView.timeParams.tempo}
                        min={40}
                        step={10}
                        onChange={(newValue) => {
                            undoManager.edit({
                                type: "EditCommand_TimeParamsTempo",
                                timeParams: arrangementView.timeParams,
                                tempo: newValue
                            });
                        }}
                    >
                    </UpDown>
                    <span>bpm</span>
                </Container>
                <Container className="time-control" crossAlignment={ChildAlignment.Center}>
                    <UpDown
                        id="length-input"
                        value={arrangementView.timeParams.length}
                        min={1}
                        step={1}
                        onConfirm={this.handleLengthChange}
                    >
                    </UpDown>
                    <span>{pluralBars ? "bars" : "bar"}</span>
                </Container>
            </div>
        );
    }

    private handleLengthChange = (newValue: number) => {
        const { arrangementView, undoManager } = this.props;

        if (!isNaN(newValue)) {
            undoManager.edit({
                type: "EditCommand_TimeParamsLength",
                timeParams: arrangementView.timeParams,
                length: newValue
            });
        }
    };

    private changeTimeSignature = (event: InputEvent) => {
        const { arrangementView: arrangement, undoManager } = this.props;

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

        undoManager.edit(command as EditCommand_TimeParamsTimeSignature);
    };

}
