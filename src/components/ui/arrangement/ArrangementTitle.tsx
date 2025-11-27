/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import { createRef, type ComponentChild } from "preact";
import { BananaDrumContext } from "../BananaDrumViewer.js";
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
    /*
    const arrangement = useContext(ArrangementPlayerContext)!.arrangement;
    const title = useStateSubscription(arrangement, (arrangement: ArrangementView) => {
        return arrangement.title;
    });
    const edit = useEditCommand();

    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editMode) {
            inputRef.current?.focus();
        }
    }, [editMode]);

    const [inputValue, setInputValue] = useState(arrangement.title);
    useSubscription(arrangement, () => {
        setInputValue(arrangement.title);
    });

    const keyUpHandler = useCallback((event: KeyboardEvent) => {
        if (event.key === "Enter") { // Enter means submit the changes and stop editing
            edit({
                type: "EditCommand_ArrangementTitle",
                arrangement,
                newTitle: (event.target as HTMLInputElement).value
            });
            onEditEnd();
        }

        if (event.key === "Escape") { // Escape means stop editing and discard the changes
            setInputValue(arrangement.title);
            onEditEnd();
        }
    }, []);

    // Click out of the input means submit the changes and stop editing
    const blurHandler = useCallback((event: FocusEvent) => {
        edit({ type: "EditCommand_ArrangementTitle", arrangement, newTitle: (event.target as HTMLInputElement).value });
        onEditEnd();
    }, []);
*/

    private bananaDrumContext?: React.ContextType<typeof BananaDrumContext>;
    private arrangementPlayerContext?: React.ContextType<typeof ArrangementPlayerContext>;
    private inputRef = createRef<HTMLInputElement>();

    public constructor(props: IArrangementTitleProps) {
        super(props);

        this.state = {
            title: "",
        };
    }

    public override render(): ComponentChild {
        const { editMode } = this.props;
        const { title, inputValue } = this.state;

        return (
            <BananaDrumContext.Consumer>
                {(bananaDrumContext) => {
                    return (
                        <ArrangementPlayerContext.Consumer>
                            {(arrangementPlayerContext) => {

                                this.useSubscriptions(arrangementPlayerContext, bananaDrumContext);

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
                                                    onKeyDown={e => {
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
            </BananaDrumContext.Consumer>
        );
    }

    private useSubscriptions = (
        arrangementPlayerContext: React.ContextType<typeof ArrangementPlayerContext>,
        bananaDrumContext: React.ContextType<typeof BananaDrumContext>
    ): void => {
        if (this.arrangementPlayerContext !== arrangementPlayerContext) {
            this.arrangementPlayerContext = arrangementPlayerContext;
            this.bananaDrumContext = bananaDrumContext;
        }
    };

    private onBlur = (event: FocusEvent) => {
        const { onEditEnd } = this.props;

        const arrangement = this.arrangementPlayerContext!.arrangement;
        this.bananaDrumContext?.edit({
            type: "EditCommand_ArrangementTitle", arrangement,
            newTitle: (event.target as HTMLInputElement).value
        });
        onEditEnd();
    };

    private onKeyUp = (event: KeyboardEvent) => {
        const { onEditEnd } = this.props;

        const arrangement = this.arrangementPlayerContext!.arrangement;
        if (event.key === "Enter") { // Enter means submit the changes and stop editing
            this.bananaDrumContext?.edit({
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
