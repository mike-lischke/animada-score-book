/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import redoIcon from "../../../assets/images/icons/redo_white.svg";
import undoIcon from "../../../assets/images/icons/undo_white.svg";

import type { ComponentChild } from "preact";
import { BananaDrumContext } from "../BananaDrumViewer.js";
import { ComponentBase, type IComponentState } from "../ComponentBase/ComponentBase.js";
import { SmallSpacer } from "../SmallSpacer.js";

export interface IUndoRedoState extends IComponentState {
    canUndo: boolean;
    canRedo: boolean;
}

export class UndoRedo extends ComponentBase<{}, IUndoRedoState> {
    private bananaDrumContext?: React.ContextType<typeof BananaDrumContext>;

    public constructor(props: {}) {
        super(props);

        this.state = {
            canUndo: false,
            canRedo: false
        };
    }

    public render(): ComponentChild {
        const { canUndo, canRedo } = this.state;

        return (
            <BananaDrumContext.Consumer>
                {(bananaDrumContext) => {
                    this.useSubscription(bananaDrumContext);

                    return (<div className='undo-redo-wrapper'>
                        <button
                            className='push-button medium gray'
                            disabled={!canUndo}
                            onClick={bananaDrumContext!.undo}
                        >
                            <img src={undoIcon} style={{ height: "0.78em" }} />
                        </button>
                        <SmallSpacer />
                        <button
                            className='push-button medium gray'
                            disabled={!canRedo}
                            onClick={bananaDrumContext!.redo}
                        >
                            <img src={redoIcon} style={{ height: "0.78em" }} />
                        </button>
                    </div>);
                }}
            </BananaDrumContext.Consumer >
        );
    }

    private useSubscription(bananaDrumContext: React.ContextType<typeof BananaDrumContext>) {
        if (this.bananaDrumContext === bananaDrumContext) {
            return;
        }

        this.bananaDrumContext = bananaDrumContext;
        bananaDrumContext?.topics.canUndo.subscribe(() => {
            this.setState({ canUndo: bananaDrumContext.canUndo });
        });
        bananaDrumContext?.topics.canRedo.subscribe(() => {
            this.setState({ canRedo: bananaDrumContext.canRedo });
        });
    }
}
