/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild, ContextType } from "preact";

import { WaveformPlayer } from "../components/ui/composites/WaveformPlayer.js";
import { Container } from "../components/ui/framework/Container.js";
import { Label } from "../components/ui/framework/Label.js";
import {
    SplitContainer, type ISplitterPane, type ISplitterPaneSizeInfo
} from "../components/ui/framework/SplitContainer.js";
import { Orientation } from "../components/ui/framework/ui-types.js";
import { UIComponent } from "../components/ui/framework/UIComponent.js";
import { SbDmEntityType, type ISbDmSoundFile, type ISbDmSoundFolder } from "../core/ScoreBookDataModel.js";
import { getApiBase } from "../core/utils.js";
import { AppContext } from "./index.js";

interface IInstrumentManagerState {
    /** The URL of the audio/video currently being loaded in the transcriber. */
    selectedUrl?: string;

    /** The URL of the sound library entry currently being played. */
    currentAudioPath?: string;

    currentSplitterPosition: number;
}

/** A component to load a tree of sound files from the server, which represend */
export class InstrumentManager extends UIComponent<{}, IInstrumentManagerState> {
    public static override contextType = AppContext;
    declare public context: ContextType<typeof AppContext>;

    private audio?: HTMLAudioElement;

    public constructor(props: {}) {
        super(props);

        this.state = {
            currentSplitterPosition: 350,
            selectedUrl: this.getSoundUrl("70bpm 01 Capoeira/70_01_Atabaque_End.wav"),
        };
    }

    public render(): ComponentChild {
        const { selectedUrl, currentSplitterPosition } = this.state;

        const fsEntries = this.context.dataModel.soundLib;

        const panes: ISplitterPane[] = [{
            minSize: 350,
            initialSize: currentSplitterPosition,
            resizable: true,
            content: (
                <Container
                    orientation={Orientation.TopDown}
                    style={{ flex: 1, height: "100%", marginRight: "16px" }}
                >
                    <Label heading={true} caption="Sound Library Files" />
                    <Container
                        id="fileTreeHost"
                        orientation={Orientation.TopDown}
                    >
                        <ul class="file-tree">
                            {fsEntries.map((entry) => {
                                return this.renderEntry(entry);
                            })}
                        </ul>

                    </Container>
                </Container>
            )
        }, {
            minSize: 300,
            content: (
                <Container
                    orientation={Orientation.TopDown}
                    style={{ flex: 1, height: "100%", marginLeft: "16px" }}>
                    <Label heading={true} caption="Replay and Range Selection" />
                    {selectedUrl && (
                        <Container
                            className="waveform-panel"
                            orientation={Orientation.TopDown}
                        >
                            <WaveformPlayer url={selectedUrl} />
                        </Container>
                    )}
                </Container>
            )
        }];

        return (
            <AppContext.Consumer>
                {({ dataModel }) => {
                    return (
                        <SplitContainer
                            id="instrumentManagerSplitter"
                            orientation={Orientation.LeftToRight}
                            panes={panes}
                            onPaneResized={this.handleSplitterResize}
                        />
                    );
                }}
            </AppContext.Consumer>
        );
    }

    private renderEntry = (entry: ISbDmSoundFolder | ISbDmSoundFile) => {
        if (entry.type === SbDmEntityType.SoundFolder) {
            return (
                <li key={entry.id}>
                    <div
                        class="tree-item dir"
                        onClick={() => {
                            this.toggle(entry);
                        }}
                    >
                        {entry.state.expanded ? "📂" : "📁"} {entry.name}
                    </div>
                    {entry.state.expanded && entry.children && entry.children.length > 0 && (
                        <ul>
                            {entry.children.map((child) => {
                                return this.renderEntry(child);
                            })}
                        </ul>
                    )}
                </li>
            );
        }

        return (
            <li key={entry.id}>
                <div
                    class="tree-item file"
                >
                    📄 {entry.name}
                </div>
            </li>
        );
    };

    private toggle(entry: ISbDmSoundFolder) {
        entry.state.expanded = !entry.state.expanded;
        this.forceUpdate();
    };

    private getSoundUrl(path: string): string {
        // Pfad anpassen, falls nötig
        const base = getApiBase();

        return `${base}/soundLib/${path}`;
    }

    /*private playSound = (node: IFSNode) => {
        if (node.isDir) {
            return;
        }

        const url = this.getSoundUrl(node.path);

        // Stop any currently playing audio.
        if (this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
        }

        this.audio = new Audio(url);
        this.audio.play().catch((err: unknown) => {
            console.error("Couldn't play audio", err);
        });

        this.setState({ currentAudioPath: node.path });
    };*/

    private handleSplitterResize = (info: ISplitterPaneSizeInfo[]): void => {
        this.setState({ currentSplitterPosition: info[0].currentSize });
    };

}
