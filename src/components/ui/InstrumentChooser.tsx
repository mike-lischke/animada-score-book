/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild, ContextType } from "preact";

import type { ArrangementView, InstrumentMeta } from "../../core/index.js";
import { getLibrary } from "../../core/Library.js";
import { ArrangementPlayerContext } from "./arrangement/ArrangementViewer.js";
import { ComponentBase, type IComponentProperties } from "./ComponentBase/ComponentBase.js";
import { BananaDrumContext } from "./ScoreBookViewer.js";

export interface IInstrumentChooserProps extends IComponentProperties {
    instrumentMeta: InstrumentMeta;
    close: () => void;
}

export class InstrumentChooser extends ComponentBase<IInstrumentChooserProps> {
    private bananaDrumContext?: ContextType<typeof BananaDrumContext>;

    public render(): ComponentChild {
        const { instrumentMeta } = this.props;

        return (
            <BananaDrumContext.Consumer>
                {(bananaDrumContext) => {
                    this.bananaDrumContext = bananaDrumContext;

                    return (
                        <ArrangementPlayerContext.Consumer>
                            {(context) => {
                                const arrangement: ArrangementView = context!.arrangement;

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
            </BananaDrumContext.Consumer>
        );
    }

    private buttonClick(arrangement: ArrangementView) {
        const { instrumentMeta, close } = this.props;

        this.bananaDrumContext?.edit({
            type: "EditCommand_ArrangementAddTrack", arrangement, addTrack: getLibrary()
                .getInstrument(instrumentMeta.id)
        });

        close();
    }
}
