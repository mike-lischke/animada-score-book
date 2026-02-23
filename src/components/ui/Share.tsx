/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

import type { ComponentChild } from "preact";

import { getShareLink } from "../../core/serialisation/url.js";
import type { UndoManager } from "../../core/UndoManager.js";
import type { ArrangementPlayer } from "../../player/ArrangementPlayer.js";
import { Button } from "./framework/Button.js";
import { UIComponent, type ICommonUIProperties } from "./framework/UIComponent.js";
import { Overlay } from "./Overlay.js";
import { Separator } from "./Separator.js";

const haveNativeSharing = "share" in navigator;
const haveClipboardAccess = "clipboard" in navigator;

export interface IShareProperties extends ICommonUIProperties {
    arrangementPlayer: ArrangementPlayer;
    undoManager: UndoManager;
}

interface IShareState {
    url: string;
    copyText: string;
    title: string;
}

export class Share extends UIComponent<IShareProperties, IShareState> {

    public constructor(props: IShareProperties) {
        super(props);

        this.state = {
            url: "",
            copyText: "copy",
            title: "",
        };
    }

    public override componentDidMount(): void {
        const { arrangementPlayer } = this.props;

        const arrangement = arrangementPlayer.arrangementView;
        this.addSubscription(arrangementPlayer, () => {
            this.setState({ title: arrangement.title });
        });
    }

    public render(): ComponentChild {
        const { url, title, copyText } = this.state;

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
                                                <Button
                                                    className="push-button"
                                                    onClick={() => {
                                                        void navigator.share(
                                                            { url, title: sharedTitle });
                                                    }}
                                                >share</Button>

                                            }
                                            {haveNativeSharing && haveClipboardAccess &&
                                                <Separator />
                                            }
                                            {haveClipboardAccess &&
                                                <Button
                                                    className="push-button"
                                                    onClick={
                                                        this.copyButtonClick.bind(this, url)
                                                    }
                                                >{copyText}</Button>

                                            }
                                        </div>

                                    </div>
                                </>) :
                                (<>
                                    <h2>Ready to share this beat?</h2>
                                    <Button
                                        className="push-button shiny-link"
                                        onClick={this.showLink}>
                                        generate link!
                                    </Button>
                                </>)
                            }
                        </>
                    </div>
                    <Button
                        id="load-button"
                        className="push-button"
                        onClick={this.close}
                    >
                        Back to my beat!
                    </Button>
                </div>
            </div>
        );
    }

    private close = () => {
        Overlay.toggleOverlay("share", "hide");
        this.setState({ url: "" });
    };

    private showLink = () => {
        const { undoManager } = this.props;
        this.setState({ url: getShareLink(undoManager.currentState) });
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
