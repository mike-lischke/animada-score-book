/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { ISbDmInstrument, ScoreBookDataModel } from "../../core/ScoreBookDataModel.js";
import { Button } from "./framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";

export interface IInstrumentChooserProps extends ICommonUIProperties {
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
        const { instrument, close, dataModel } = this.props;

        dataModel.addTrack(instrument);

        close();
    };
}
