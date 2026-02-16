/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type ComponentChild } from "preact";

import type { IArrangement } from "../../../core/types/general.js";
import type { UndoManager } from "../../../core/UndoManager.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface IArrangementTitleProps extends ICommonUIProperties {
    arrangement: Readonly<IArrangement>;
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

    public override componentDidUpdate(prevProps: IArrangementTitleProps): void {
        const { arrangement } = this.props;

        if (arrangement.title !== this.state.title) {
            this.setState({ title: arrangement.title, inputValue: arrangement.title });
        }
    }

    public override render(): ComponentChild {
        const { editMode } = this.props;
        const { title, inputValue } = this.state;

        return (
            <div id="title-wrapper" style={{ textAlign: "center" }}>
                {
                    editMode
                        ? <input
                            ref={this.inputRef}
                            onBlur={this.onBlur}
                            onChange={(e) => {
                                this.setState({
                                    inputValue: (e.target as HTMLInputElement).value
                                });
                            }}
                            onKeyUp={this.onKeyUp}
                            onKeyDown={(e) => {
                                e.stopPropagation();
                            }}
                            // Don't want to trigger global keyboard handlers,
                            // like play-on-spacebar.
                            style={{
                                height: "unset",
                                width: "100%",
                                border: "none",
                                textAlign: "center",
                                fontSize: "2em",
                                fontWeight: "bold",
                                marginBlockStart: "0.67em",
                                marginBlockEnd: "0.67em",
                                padding: "0"
                            }}
                            placeholder="Add a title..."
                            value={inputValue}
                        />
                        : <h1>{title}</h1>
                }
            </div>
        );
    }

    private onBlur = (event: FocusEvent) => {
        const { onEditEnd, undoManager, arrangement } = this.props;

        undoManager.edit({
            type: "EditCommand_ArrangementTitle", arrangement,
            newTitle: (event.target as HTMLInputElement).value
        });
        onEditEnd();
    };

    private onKeyUp = (event: KeyboardEvent) => {
        const { onEditEnd, undoManager, arrangement } = this.props;

        if (event.key === "Enter") { // Enter means submit the changes and stop editing
            undoManager.edit({
                type: "EditCommand_ArrangementTitle",
                arrangement,
                newTitle: (event.target as HTMLInputElement).value
            });
            onEditEnd();
        }

        if (event.key === "Escape") { // Escape means stop editing and discard the changes
            this.setState({ inputValue: arrangement.title });
            onEditEnd();
        }
    };
}
