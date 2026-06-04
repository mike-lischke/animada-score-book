/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type ComponentChild } from "preact";

import type { ISbDmArrangement } from "../../../core/ScoreBookDataModel.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import { Input } from "../framework/Input.js";
import { Label } from "../framework/Label.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface IArrangementTitleProps extends ICommonUIProperties {
    arrangement: Readonly<ISbDmArrangement>;
    undoManager: UndoManager;
    editMode: boolean;
    onEditEnd: () => void;
}

interface IArrangementTitleState {
    title: string;
    inputValue?: string;
}

export class ArrangementTitle extends UIComponent<IArrangementTitleProps, IArrangementTitleState> {
    private inputRef = createRef<HTMLInputElement>();

    public constructor(props: IArrangementTitleProps) {
        super(props);

        this.state = {
            title: "",
        };
    }

    public override componentDidMount(): void {
        const { editMode, arrangement } = this.props;
        if (editMode) {
            this.inputRef.current?.focus();
        }

        this.setState({ title: arrangement.title, inputValue: arrangement.title });
    }

    public override componentDidUpdate(prevProps: IArrangementTitleProps, prevState: IArrangementTitleState): void {

        const { arrangement } = this.props;
        const { title } = this.state;

        if (arrangement.title !== title) {
            this.setState({ title: arrangement.title, inputValue: arrangement.title });
        }
    }

    public override render(): ComponentChild {
        const { id, editMode } = this.props;
        const { title, inputValue } = this.state;

        if (editMode) {
            return (
                <Input
                    id={id}
                    ref={this.inputRef}
                    className={`input px-0 py-0`}
                    autoFocus
                    onChange={(e) => {
                        this.setState({
                            inputValue: (e.target as HTMLInputElement).value
                        });
                    }}
                    onConfirm={this.onConfirm}
                    onCancel={this.onCancel}
                    onBlur={this.onBlur}
                    onKeyDown={(e) => {
                        // Don't forward key events to parent elements, as they might trigger unwanted actions
                        // (e.g. space triggering play/pause).
                        e.stopPropagation();
                    }}
                    placeholder="Add a title..."
                    value={inputValue}
                />
            );
        }

        return (
            <Label id={id}>{title}</Label>
        );
    }

    private onBlur = (event: FocusEvent) => {
        const { editMode, onEditEnd, undoManager, arrangement } = this.props;

        if (editMode) {
            undoManager.edit({
                type: "EditCommand_ArrangementTitle", arrangement,
                newTitle: (event.target as HTMLInputElement).value
            });
            onEditEnd();
        }
    };

    private onConfirm = (event: KeyboardEvent) => {
        const { onEditEnd, undoManager, arrangement } = this.props;

        undoManager.edit({
            type: "EditCommand_ArrangementTitle", arrangement,
            newTitle: (event.target as HTMLInputElement).value
        });
        onEditEnd();
    };

    private onCancel = (event: KeyboardEvent) => {
        const { onEditEnd, arrangement } = this.props;

        this.setState({ inputValue: arrangement.title });
        onEditEnd();
    };

}
