/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { ISbDmInstrument } from "../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../core/UndoManager.js";
import { Button } from "./framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";

export interface IInstrumentChooserProps extends ICommonUIProperties {
    undoManager: UndoManager;
    instrument: ISbDmInstrument;
    close: () => void;
}

export class InstrumentChooser extends UIComponent<IInstrumentChooserProps> {
    public render(): ComponentChild {
        const { instrument } = this.props;

        return (
            <Button
                className="instrument-chooser push-button"
                onClick={this.buttonClick}
            >
                {instrument.displayName}
            </Button>
        );
    }

    private buttonClick = () => {
        const { instrument, close, undoManager } = this.props;

        undoManager.edit({
            type: "EditCommand_ArrangementAddTrack",
            arrangement: undoManager.arrangement,
            addTrack: instrument,
        });

        close();
    };
}
