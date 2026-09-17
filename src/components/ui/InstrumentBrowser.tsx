/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { ScoreBookDataModel } from "../../core/ScoreBookDataModel.js";
import { Button } from "./framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";
import { InstrumentChooser } from "./InstrumentChooser.js";

export interface IInstrumentBrowserProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    close: () => void;
}

export class InstrumentBrowser extends UIComponent<IInstrumentBrowserProperties> {

    public render(): ComponentChild {
        const { close, dataModel } = this.props;
        const instruments = dataModel.instruments;

        return (
            <div className="viewport-wrapper">
                <div style={{ padding: "20pt" }}>
                    {instruments.map((meta) => {
                        return <InstrumentChooser
                            key={meta.id}
                            instrument={meta}
                            close={close}
                            dataModel={dataModel}
                        />;
                    })}
                    <br />
                    <br />
                    <Button onClick={close}>Back</Button>
                </div>
            </div>
        );
    }
}
