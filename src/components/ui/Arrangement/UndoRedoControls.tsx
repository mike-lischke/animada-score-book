/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import type { UndoManager } from "../../../core/UndoManager.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import { Button } from "../framework/Button.js";
import { Codicon } from "../framework/Codicon.js";
import { Container } from "../framework/Container.js";
import { Icon } from "../framework/Icon.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

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
        requisitions.unregister("canUndoChanged", this.handleCanUndoChanged);
        requisitions.unregister("canRedoChanged", this.handleCanRedoChanged);
    }

    public render(): ComponentChild {
        const { undoManager } = this.props;
        const { canUndo, canRedo } = this.state;

        // TODO: make the undo/redo records human readable and show the current state in the tooltips.
        // const state = undoManager.currentState;

        return (
            <Container id='undoRedoControls'>
                <Button
                    disabled={!canUndo}
                    onClick={undoManager.undo}
                    imageOnly
                    data-tooltip="Revert your last change"
                >
                    <Icon src={Codicon.Discard} data-tooltip="inherit" />
                </Button>
                <Button
                    disabled={!canRedo}
                    onClick={undoManager.redo}
                    imageOnly
                    data-tooltip="Redo the last change you reverted"
                >
                    <Icon src={Codicon.Redo} data-tooltip="inherit" />
                </Button>
            </Container>
        );
    }

    private prepareSubscriptions(): void {
        requisitions.register("canUndoChanged", this.handleCanUndoChanged);
        requisitions.register("canRedoChanged", this.handleCanRedoChanged);
    }

    private handleCanUndoChanged = (): Promise<boolean> => {
        const { undoManager } = this.props;
        this.setState({ canUndo: undoManager.canUndo });

        return Promise.resolve(true);
    };

    private handleCanRedoChanged = (): Promise<boolean> => {
        const { undoManager } = this.props;
        this.setState({ canRedo: undoManager.canRedo });

        return Promise.resolve(true);
    };
}
