/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import redoIcon from "../../../assets/images/icons/redo_white.svg";
import undoIcon from "../../../assets/images/icons/undo_white.svg";

import type { ComponentChild } from "preact";

import type { UndoManager } from "../../../core/UndoManager.js";
import { Button } from "../framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { SmallSpacer } from "../SmallSpacer.js";

export interface IUndoRedoProps extends ICommonUIProperties {
    undoManager: UndoManager;
}

export interface IUndoRedoState {
    canUndo: boolean;
    canRedo: boolean;
}

export class UndoRedoControls extends UIComponent<IUndoRedoProps, IUndoRedoState> {
    public constructor(props: IUndoRedoProps) {
        super(props);

        this.state = {
            canUndo: false,
            canRedo: false
        };
    }

    public override componentDidMount(): void {
        const { undoManager } = this.props;

        this.addSubscription(undoManager.topics.canUndo, () => {
            this.setState({ canUndo: undoManager.canUndo });
        });
        this.addSubscription(undoManager.topics.canRedo, () => {
            this.setState({ canRedo: undoManager.canRedo });
        });

    }

    public render(): ComponentChild {
        const { undoManager } = this.props;
        const { canUndo, canRedo } = this.state;

        return (
            <div className='undo-redo-wrapper'>
                <Button
                    className='push-button medium gray'
                    disabled={!canUndo}
                    onClick={undoManager.undo}
                >
                    <img src={undoIcon} style={{ height: "0.78em" }} />
                </Button>
                <SmallSpacer />
                <Button
                    className='push-button medium gray'
                    disabled={!canRedo}
                    onClick={undoManager.redo}
                >
                    <img src={redoIcon} style={{ height: "0.78em" }} />
                </Button>
            </div>
        );
    }
}
