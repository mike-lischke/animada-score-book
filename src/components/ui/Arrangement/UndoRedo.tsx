/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import redoIcon from "../../../assets/images/icons/redo_white.svg";
import undoIcon from "../../../assets/images/icons/undo_white.svg";

import type { ComponentChild, ContextType } from "preact";

import { UIComponent } from "../framework/UIComponent.js";
import { UndoManagerContext } from "../ScoreBookViewer.js";
import { SmallSpacer } from "../SmallSpacer.js";
import { Button } from "../framework/Button.js";

export interface IUndoRedoState {
    canUndo: boolean;
    canRedo: boolean;
}

export class UndoRedo extends UIComponent<{}, IUndoRedoState> {
    private scoreBookContext?: ContextType<typeof UndoManagerContext>;

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
            <UndoManagerContext.Consumer>
                {(scoreBookContext) => {
                    this.useSubscription(scoreBookContext);

                    return (<div className='undo-redo-wrapper'>
                        <Button
                            className='push-button medium gray'
                            disabled={!canUndo}
                            onClick={scoreBookContext?.undo}
                        >
                            <img src={undoIcon} style={{ height: "0.78em" }} />
                        </Button>
                        <SmallSpacer />
                        <Button
                            className='push-button medium gray'
                            disabled={!canRedo}
                            onClick={scoreBookContext?.redo}
                        >
                            <img src={redoIcon} style={{ height: "0.78em" }} />
                        </Button>
                    </div>);
                }}
            </UndoManagerContext.Consumer >
        );
    }

    private useSubscription(scoreBookContext: ContextType<typeof UndoManagerContext>) {
        if (this.scoreBookContext === scoreBookContext) {
            return;
        }

        this.scoreBookContext = scoreBookContext;
        scoreBookContext?.topics.canUndo.subscribe(() => {
            this.setState({ canUndo: scoreBookContext.canUndo });
        });
        scoreBookContext?.topics.canRedo.subscribe(() => {
            this.setState({ canRedo: scoreBookContext.canRedo });
        });
    }
}
