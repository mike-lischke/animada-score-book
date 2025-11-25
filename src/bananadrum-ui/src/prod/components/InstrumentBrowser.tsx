/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import { useContext } from "preact/hooks";

import type { JSX } from "preact/jsx-runtime";
import type { ArrangementView, InstrumentMeta } from "../../../../bananadrum-core/src/prod/index.js";
import { getLibrary } from "../../../../bananadrum-core/src/prod/Library.js";
import { EditFunction, useEditCommand } from "../hooks/useEditCommand.js";
import { ArrangementPlayerContext } from "./arrangement/ArrangementViewer.js";

export function InstrumentBrowser({ close }: { close: () => void; }): JSX.Element {
    return (
        <div className="viewport-wrapper">
            <div style={{ padding: "20pt" }}>
                {getLibrary().instrumentMetas.map(meta => {
                    return <InstrumentChooser key={meta.id} instrumentMeta={meta} close={close} />;
                })}
                <br />
                <br />
                <button className="push-button" onClick={close}>Back</button>
            </div>
        </div>
    );
}

function InstrumentChooser(
    { instrumentMeta, close }: { instrumentMeta: InstrumentMeta, close: () => void; }): JSX.Element {
    const { id, displayName } = instrumentMeta;
    const arrangement: ArrangementView = useContext(ArrangementPlayerContext)!.arrangement;
    const edit = useEditCommand();

    return (
        <button className="instrument-chooser push-button" onClick={() => {
            choose(id, arrangement, edit);
            close();
        }}>
            {displayName}
        </button>
    );
}

function choose(id: string, arrangement: ArrangementView, edit: EditFunction) {
    edit({ type: "EditCommand_ArrangementAddTrack", arrangement, addTrack: getLibrary().getInstrument(id) });
}
