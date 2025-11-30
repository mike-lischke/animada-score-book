/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild, ContextType } from "preact";

import { getShareLink } from "../../core/serialisation/url.js";
import { ArrangementPlayerContext } from "./arrangement/ArrangementViewer.js";
import { ComponentBase, type IComponentState } from "./ComponentBase/ComponentBase.js";
import { Overlay } from "./Overlay.js";
import { AnimadaScoreBookContext } from "./ScoreBookViewer.js";
import { SmallSpacer } from "./SmallSpacer.js";

const haveNativeSharing = "share" in navigator;
const haveClipboardAccess = "clipboard" in navigator;

interface IShareState extends IComponentState {
    url: string;
    copyText: string;
    title: string;
}

export class Share extends ComponentBase<{}, IShareState> {
    private scoreBookContext: ContextType<typeof AnimadaScoreBookContext> | null = null;

    public constructor(props: {}) {
        super(props);

        this.state = {
            url: "",
            copyText: "copy",
            title: "",
        };
    }

    public render(): ComponentChild {
        const { url, title, copyText } = this.state;

        return (
            <ArrangementPlayerContext.Consumer>
                {(context) => {
                    return (
                        <AnimadaScoreBookContext.Consumer>
                            {(scoreBookContext) => {
                                if (!this.scoreBookContext) {
                                    this.scoreBookContext = scoreBookContext;
                                    const arrangement = context!.arrangement;
                                    arrangement.subscribe(() => {
                                        this.setState({ title: arrangement.title });
                                    });
                                }

                                const sharedTitle = title
                                    ? title + " - Animada Score Book" : "Animada Score Book - Samba Rhythms";

                                return (
                                    <div className="viewport-wrapper">
                                        <div id="share">
                                            <div className="share-content-wrapper">
                                                <>
                                                    {url ?
                                                        (<>
                                                            <h2>Here's your beat:</h2>
                                                            <div className="beat-url">
                                                                <p onClick={this.selectContent}>{url}</p>
                                                                <div id="share-link-buttons"
                                                                    style={{
                                                                        display: "flex",
                                                                        flexDirection: "row",
                                                                        justifyContent: "center"
                                                                    }}>
                                                                    {haveNativeSharing &&
                                                                        <button
                                                                            className="push-button"
                                                                            onClick={() => {
                                                                                void navigator.share(
                                                                                    { url, title: sharedTitle });
                                                                            }}
                                                                        >share</button>

                                                                    }
                                                                    {haveNativeSharing && haveClipboardAccess &&
                                                                        <SmallSpacer />
                                                                    }
                                                                    {haveClipboardAccess &&
                                                                        <button
                                                                            className="push-button"
                                                                            onClick={
                                                                                this.copyButtonClick.bind(this, url)
                                                                            }
                                                                        >{copyText}</button>

                                                                    }
                                                                </div>

                                                            </div>
                                                        </>) :
                                                        (<>
                                                            <h2>Ready to share this beat?</h2>
                                                            <button
                                                                className="push-button shiny-link"
                                                                onClick={this.showLink}>
                                                                generate link!
                                                            </button>
                                                        </>)
                                                    }
                                                </>
                                            </div>
                                            <button
                                                id="load-button"
                                                className="push-button"
                                                onClick={this.close}
                                            >Back to my beat!</button>
                                        </div>
                                    </div>
                                );
                            }}
                        </AnimadaScoreBookContext.Consumer>
                    );
                }}
            </ArrangementPlayerContext.Consumer>
        );
    }

    private close = () => {
        Overlay.toggleOverlay("share", "hide");
        this.setState({ url: "" });
    };

    private showLink = () => {
        this.setState({ url: getShareLink(this.scoreBookContext!.currentState) });
    };

    private selectContent = (event: MouseEvent) => {
        window.getSelection()?.selectAllChildren(event.currentTarget as HTMLElement);
    };

    private copyButtonClick = (url: string): void => {
        void navigator.clipboard.writeText(url).catch(() => {
            this.setState({ copyText: "That didn't work :(" });
            setTimeout(() => {
                this.setState({ copyText: "copy" });
            }, 3000);
        }).then(() => {
            this.setState({ copyText: "copied!" });
            setTimeout(() => {
                this.setState({ copyText: "copy" });
            }, 3000);
        });
    };
}
