/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { ISbDmInstrument, ScoreBookDataModel } from "../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../core/UndoManager.js";
import { Button } from "./framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";

export interface IInstrumentChooserProps extends ICommonUIProperties {
    undoManager: UndoManager;
    dataModel: ScoreBookDataModel;
    instrument: ISbDmInstrument;
    close: () => void;
}

export class InstrumentChooser extends UIComponent<IInstrumentChooserProps> {
    public render(): ComponentChild {
        const { instrument } = this.props;

        return (
            <Button
                className="instrument-chooser"
                onClick={this.buttonClick}
            >
                {instrument.displayName}
            </Button>
        );
    }

    private buttonClick = () => {
        const { instrument, close, undoManager, dataModel } = this.props;

        undoManager.edit({
            type: "EditCommand_ArrangementAddTrack",
            arrangement: dataModel.arrangement!,
            addTrack: instrument,
        });

        close();
    };
}
