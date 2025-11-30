/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type ComponentChild, type ContextType } from "preact";

import { AnimadaScoreBookContext } from "../ScoreBookViewer.js";
import { ComponentBase, type IComponentProperties } from "../ComponentBase/ComponentBase.js";
import { ArrangementPlayerContext } from "./ArrangementViewer.js";

export interface IArrangementTitleProps extends IComponentProperties {
    editMode: boolean;
    onEditEnd: () => void;
}

interface IArrangementTitleState {
    title: string;
    inputValue?: string;
}

export class ArrangementTitle extends ComponentBase<IArrangementTitleProps, IArrangementTitleState> {

    private scoreBookContext?: ContextType<typeof AnimadaScoreBookContext>;
    private arrangementPlayerContext?: ContextType<typeof ArrangementPlayerContext>;
    private inputRef = createRef<HTMLInputElement>();

    public constructor(props: IArrangementTitleProps) {
        super(props);

        this.state = {
            title: "",
        };
    }

    public override componentDidMount(): void {
        const { editMode } = this.props;
        if (editMode) {
            this.inputRef.current?.focus();
        }

        const arrangement = this.arrangementPlayerContext?.arrangement;
        if (arrangement) {
            this.setState({ title: arrangement.title, inputValue: arrangement.title });
        }
    }

    public override render(): ComponentChild {
        const { editMode } = this.props;
        const { title, inputValue } = this.state;

        return (
            <AnimadaScoreBookContext.Consumer>
                {(scoreBookContext) => {
                    return (
                        <ArrangementPlayerContext.Consumer>
                            {(arrangementPlayerContext) => {
                                this.useSubscriptions(arrangementPlayerContext, scoreBookContext);

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
                            }}
                        </ArrangementPlayerContext.Consumer>
                    );
                }}
            </AnimadaScoreBookContext.Consumer>
        );
    }

    private useSubscriptions = (
        arrangementPlayerContext: ContextType<typeof ArrangementPlayerContext>,
        scoreBookContext: ContextType<typeof AnimadaScoreBookContext>
    ): void => {
        if (this.arrangementPlayerContext !== arrangementPlayerContext) {
            this.arrangementPlayerContext = arrangementPlayerContext;
            this.scoreBookContext = scoreBookContext;

            this.setState({ inputValue: arrangementPlayerContext!.arrangement.title });
        }
    };

    private onBlur = (event: FocusEvent) => {
        const { onEditEnd } = this.props;

        const arrangement = this.arrangementPlayerContext!.arrangement;
        this.scoreBookContext?.edit({
            type: "EditCommand_ArrangementTitle", arrangement,
            newTitle: (event.target as HTMLInputElement).value
        });
        onEditEnd();
    };

    private onKeyUp = (event: KeyboardEvent) => {
        const { onEditEnd } = this.props;

        const arrangement = this.arrangementPlayerContext!.arrangement;
        if (event.key === "Enter") { // Enter means submit the changes and stop editing
            this.scoreBookContext?.edit({
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
