/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";
import { getLibrary } from "../../core/Library.js";
import { ComponentBase, type IComponentProperties } from "./ComponentBase/ComponentBase.js";
import { InstrumentChooser } from "./InstrumentChooser.js";

export interface IInstrumentBrowserProps extends IComponentProperties {
    close: () => void;
}

export class InstrumentBrowser extends ComponentBase<IInstrumentBrowserProps> {
    public render(): ComponentChild {
        return (
            <div className="viewport-wrapper">
                <div style={{ padding: "20pt" }}>
                    {getLibrary().instrumentMetas.map((meta) => {
                        return <InstrumentChooser key={meta.id} instrumentMeta={meta} close={close} />;
                    })}
                    <br />
                    <br />
                    <button className="push-button" onClick={close}>Back</button>
                </div>
            </div>
        );
    }
}
