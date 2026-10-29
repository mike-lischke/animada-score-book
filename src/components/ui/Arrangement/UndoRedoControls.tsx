/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { UndoManager } from "../../../core/UndoManager.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { UIIcon } from "../framework/UIIcon.js";
import { Icon } from "../framework/Icon.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";

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
        this.prepareSubscriptions();
    }

    public override componentDidUpdate(prevProps: IUndoRedoProps, prevState: IUndoRedoState): void {
        const { undoManager } = this.props;

        if (prevProps.undoManager !== undoManager) {
            this.setState({
                canUndo: undoManager.canUndo,
                canRedo: undoManager.canRedo
            });
        }

        this.prepareSubscriptions();
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("undoStackChanged", this.handleUndoStackChanged);
    }

    public render(): ComponentChild {
        const { undoManager } = this.props;
        const { canUndo, canRedo } = this.state;

        // TODO: make the undo/redo records human readable and show the current state in the tooltips.
        // const state = undoManager.currentState;

        return (
            <Container
                className="undoRedoGroup"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
            >
                <Button
                    id="undoButton"
                    plain
                    className="headerIconButton"
                    disabled={!canUndo}
                    onClick={undoManager.undo}
                    title="Revert your last change"
                >
                    <Icon src={UIIcon.Discard} width={20} height={20} />
                </Button>
                <Button
                    id="redoButton"
                    plain
                    className="headerIconButton"
                    disabled={!canRedo}
                    onClick={undoManager.redo}
                    title="Redo the last change you reverted"
                >
                    <Icon src={UIIcon.Redo} width={20} height={20} />
                </Button>
            </Container>
        );
    }

    private prepareSubscriptions(): void {
        requisitions.register("undoStackChanged", this.handleUndoStackChanged);
    }

    private handleUndoStackChanged = (): Promise<boolean> => {
        const { undoManager } = this.props;
        this.setState({ canUndo: undoManager.canUndo, canRedo: undoManager.canRedo });

        return Promise.resolve(true);
    };
}
