/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import { Container } from "../framework/Container.js";
import { ChildAlignment } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { UndoRedoControls } from "./UndoRedoControls.js";

export interface IArrangementEditControlsProperties extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    undoManager: UndoManager;
}

export class ArrangementEditControls
    extends UIComponent<IArrangementEditControlsProperties> {

    public constructor(props: IArrangementEditControlsProperties) {
        super(props);

        this.state = {
            showClearConfirmation: false,
        };
    }

    public render() {
        const { undoManager } = this.props;

        return (
            <Container
                id="arrangementEditControls"
                crossAlignment={ChildAlignment.Center}
            >
                <UndoRedoControls undoManager={undoManager} />
            </Container>
        );
    }
};
