/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild, ContextType } from "preact";

import { getLibrary } from "../../core/Library.js";
import type { IArrangementView, IInstrumentMeta } from "../../core/types/general.js";
import { ArrangementPlayerContext } from "./Arrangement1/ArrangementViewer.js";
import { ComponentBase, type IComponentProperties } from "./ComponentBase/ComponentBase.js";
import { AnimadaScoreBookContext } from "./ScoreBookViewer.js";

export interface IInstrumentChooserProps extends IComponentProperties {
    instrumentMeta: IInstrumentMeta;
    close: () => void;
}

export class InstrumentChooser extends ComponentBase<IInstrumentChooserProps> {
    private scoreBookContext?: ContextType<typeof AnimadaScoreBookContext>;

    public render(): ComponentChild {
        const { instrumentMeta } = this.props;

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
                                        {instrumentMeta.displayName}
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
        const { instrumentMeta, close } = this.props;

        this.scoreBookContext?.edit({
            type: "EditCommand_ArrangementAddTrack", arrangement, addTrack: getLibrary()
                .getInstrument(instrumentMeta.id)
        });

        close();
    }
}
