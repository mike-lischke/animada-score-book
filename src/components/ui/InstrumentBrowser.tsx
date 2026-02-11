/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild, ContextType } from "preact";

import { AppContext } from "../../ui/index.js";
import { Button } from "./framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";
import { InstrumentChooser } from "./InstrumentChooser.js";

export interface IInstrumentBrowserProps extends ICommonUIProperties {
    close: () => void;
}

export class InstrumentBrowser extends UIComponent<IInstrumentBrowserProps> {
    public static override contextType = AppContext;
    declare public context: ContextType<typeof AppContext>;

    public render(): ComponentChild {
        const { close } = this.props;

        return (
            <AppContext.Consumer>
                {({ dataModel }) => {
                    const instruments = dataModel.instruments;

                    return (
                        <div className="viewport-wrapper">
                            <div style={{ padding: "20pt" }}>
                                {instruments.map((meta) => {
                                    return <InstrumentChooser key={meta.id} instrument={meta} close={close} />;
                                })}
                                <br />
                                <br />
                                <Button className="push-button" onClick={close}>Back</Button>
                            </div>
                        </div>
                    );
                }}
            </AppContext.Consumer>
        );
    }
}
