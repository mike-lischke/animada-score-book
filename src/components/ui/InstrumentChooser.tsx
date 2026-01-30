/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild, ContextType } from "preact";

import type { ISbDmInstrument } from "../../core/ScoreBookDataModel.js";
import type { IArrangementView } from "../../core/types/general.js";
import { ArrangementPlayerContext } from "./Arrangement/ArrangementViewer.js";
import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";
import { AnimadaScoreBookContext } from "./ScoreBookViewer.js";

export interface IInstrumentChooserProps extends ICommonUIProperties {
    instrument: ISbDmInstrument;
    close: () => void;
}

export class InstrumentChooser extends UIComponent<IInstrumentChooserProps> {
    private scoreBookContext?: ContextType<typeof AnimadaScoreBookContext>;

    public render(): ComponentChild {
        const { instrument } = this.props;

        return (
            <AnimadaScoreBookContext.Consumer>
                {(scoreBookContext) => {
                    this.scoreBookContext = scoreBookContext;

                    return (
                        <ArrangementPlayerContext.Consumer>
                            {(context) => {
                                const arrangement: IArrangementView = context!.arrangement;

                                return (
                                    <button
                                        className="instrument-chooser push-button"
                                        onClick={this.buttonClick.bind(this, arrangement)}
                                    >
                                        {instrument.displayName}
                                    </button>
                                );
                            }}
                        </ArrangementPlayerContext.Consumer>
                    );
                }}
            </AnimadaScoreBookContext.Consumer>
        );
    }

    private buttonClick(arrangement: IArrangementView) {
        const { instrument, close } = this.props;

        this.scoreBookContext?.edit({
            type: "EditCommand_ArrangementAddTrack",
            arrangement,
            addTrack: instrument,
        });

        close();
    }
}
