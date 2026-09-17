/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type ComponentChild } from "preact";

import type { ISbDmArrangement, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { KeyboardKeys } from "../../../core/utils.js";
import { Label } from "../framework/Label.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface IArrangementTitleProperties extends ICommonUIProperties {
    arrangement: Readonly<ISbDmArrangement>;
    dataModel: ScoreBookDataModel;
    editMode: boolean;
}

interface IArrangementTitleState {
    title: string;
    inputValue?: string;
}

export class ArrangementTitle extends UIComponent<IArrangementTitleProperties, IArrangementTitleState> {
    private inputRef = createRef<HTMLInputElement>();

    public constructor(props: IArrangementTitleProperties) {
        super(props);

        this.state = {
            title: "",
        };
    }

    public override componentDidMount(): void {
        const { arrangement } = this.props;

        this.setState({ title: arrangement.title, inputValue: arrangement.title });
    }

    public override componentDidUpdate(): void {
        const { arrangement } = this.props;
        const { title } = this.state;

        if (arrangement.title !== title) {
            this.setState({ title: arrangement.title, inputValue: arrangement.title });
        }
    }

    public override render(): ComponentChild {
        const { id, className, style, editMode } = this.props;
        const { title, inputValue } = this.state;

        if (editMode) {
            return (
                <input
                    id={id}
                    ref={this.inputRef}
                    className={className}
                    style={style}
                    onInput={(e) => {
                        this.setState({
                            inputValue: (e.target as HTMLInputElement).value
                        });
                    }}
                    onFocus={this.handleFocus}
                    onKeyDown={this.handleInputKeyDown}
                    onBlur={this.handleBlur}
                    value={inputValue}
                />
            );
        }

        return (
            <Label
                id={id}
                className={className}
                style={style}
                {...this.dataAttributes}
            >
                {title}
            </Label>
        );
    }

    private handleFocus = (): void => {
        this.inputRef.current?.select();
    };

    private handleBlur = (event: FocusEvent) => {
        const { dataModel, arrangement } = this.props;
        const { title } = this.state;
        const newTitle = (event.target as HTMLInputElement).value;

        if (newTitle === arrangement.title) {
            if (title !== arrangement.title) {
                this.setState({ title: arrangement.title, inputValue: arrangement.title });
            }

            return;
        }

        dataModel.setTitle(newTitle);
    };

    private handleInputKeyDown = (e: KeyboardEvent) => {
        const { arrangement } = this.props;

        switch (e.key) {
            case KeyboardKeys.Enter: {
                this.inputRef.current?.blur();

                break;
            }

            case KeyboardKeys.Escape: {
                const input = this.inputRef.current;
                if (input) {
                    input.value = arrangement.title;
                }

                this.setState({ inputValue: arrangement.title }, () => {
                    this.inputRef.current?.blur();
                });

                break;
            }

            default: {
                break;
            }
        }
    };

}
