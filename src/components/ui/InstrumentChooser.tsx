/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild, ContextType } from "preact";

import type { ISbDmInstrument } from "../../core/ScoreBookDataModel.js";
import type { IArrangement } from "../../core/types/general.js";
import { ArrangementPlayerContext } from "./Arrangement/ArrangementViewer.js";
import { Button } from "./framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";
import { UndoManagerContext } from "./ScoreBookViewer.js";

export interface IInstrumentChooserProps extends ICommonUIProperties {
    instrument: ISbDmInstrument;
    close: () => void;
}

export class InstrumentChooser extends UIComponent<IInstrumentChooserProps> {
    private scoreBookContext?: ContextType<typeof UndoManagerContext>;

    public render(): ComponentChild {
        const { instrument } = this.props;

        return (
            <UndoManagerContext.Consumer>
                {(scoreBookContext) => {
                    this.scoreBookContext = scoreBookContext;

                    return (
                        <ArrangementPlayerContext.Consumer>
                            {(context) => {
                                const arrangement = context!.arrangementView;

                                return (
                                    <Button
                                        className="instrument-chooser push-button"
                                        onClick={this.buttonClick.bind(this, arrangement)}
                                    >
                                        {instrument.displayName}
                                    </Button>
                                );
                            }}
                        </ArrangementPlayerContext.Consumer>
                    );
                }}
            </UndoManagerContext.Consumer>
        );
    }

    private buttonClick(arrangement: IArrangement) {
        const { instrument, close } = this.props;

        this.scoreBookContext?.edit({
            type: "EditCommand_ArrangementAddTrack",
            arrangement,
            addTrack: instrument,
        });

        close();
    }
}
