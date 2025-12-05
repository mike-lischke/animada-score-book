/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, render, type ComponentChild } from "preact";

import type { CellComponent, ColumnDefinition, RowComponent } from "tabulator-tables";
import { WaveformPlayer } from "../components/ui/composites/WaveformPlayer.js";
import { Codicon } from "../components/ui/framework/Codicon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { SplitContainer, type ISplitterPane } from "../components/ui/framework/SplitContainer.js";
import { TreeGrid, type ITreeGridOptions } from "../components/ui/framework/TreeGrid.js";
import { UIComponent } from "../components/ui/framework/UIComponent.js";
import { Orientation, SelectionType } from "../components/ui/framework/ui-types.js";
import { getApiBase } from "../core/utils.js";

interface IFolderDBEntry {
    id: number;
    parentid: number;
    name: string;
    hasChildren: boolean;
}

interface ISnippetDBEntry {
    id: number;
    folderid: number;
    name: string;
    content: string;
}

interface IScoreDBEntry {
    folders: IFolderDBEntry[];
    snippets: ISnippetDBEntry[];
}

interface IScoreNode {
    [key: string]: unknown; // Just to please the Tabulator data model.

    id: number;
    parentid: number;
    name: string;
    isDir: boolean;
    children?: IScoreNode[];

    expanded: boolean;
    expandedOnce: boolean;
}

interface IScoreLibraryState {
    url?: string;
    root?: IScoreNode[];
}

/**
 * A component to manage a tree of score snippets from the server.
 * The user can select one score to load it into the player/editor.
 */
export class ScoreLibrary extends UIComponent<{}, IScoreLibraryState> {
    private scoreTableRef = createRef<TreeGrid>();

    public constructor(props: {}) {
        super(props);
        this.state = {};

        void this.loadScoreFolder("list", -1).then((data) => {
            this.setState({ root: data });
        });
    }

    public render(): ComponentChild {
        const { url, root } = this.state;

        const scoreTreeColumns: ColumnDefinition[] = [{
            title: "",
            field: "name",
            resizable: false,
            hozAlign: "left",
            formatter: this.scoreTreeCellFormatter,
            cellDblClick: this.handleScoreTreeDoubleClick,
        }];

        const scoreTreeOptions: ITreeGridOptions = {
            treeColumn: "name",
            selectionType: SelectionType.Single,
            showHeader: false,
            layout: "fitColumns",
            horizontalGridLines: false,
            verticalGridLines: false,
        };

        const panes: ISplitterPane[] = [{
            id: "libraryPane",
            content: (
                <Container
                    id="libraryPaneContent"
                    orientation={Orientation.TopDown}
                >
                    <Container orientation={Orientation.LeftToRight}>
                        <Icon src={Codicon.Music} style={{ fontSize: "50px", color: "cornflowerblue" }} />
                        <Label heading={true} style={{ marginLeft: "16px" }}>Score Library</Label>
                    </Container>
                    <Container
                        id="scoreTreeHost"
                        orientation={Orientation.TopDown}
                        style={{ flex: 1, height: "100%" }}
                    >
                        <TreeGrid
                            ref={this.scoreTableRef}
                            options={scoreTreeOptions}
                            columns={scoreTreeColumns}
                            tableData={root}

                            onRowSelected={this.handleScoreTreeRowSelected}
                            onRowExpanded={this.handleScoreTreeRowExpanded}
                            onRowCollapsed={this.handleScoreTreeRowCollapsed}
                            isRowExpanded={this.isScoreTreeRowExpanded}
                            onRowContext={this.handleScoreTreeRowContext}
                        />
                    </Container>
                </Container >
            ),
            minSize: 350,
            initialSize: 350,
            resizable: true,
        }, {
            id: "transcriptionPane",
            content: (
                <Container
                    id="transcriptionPaneContent"
                    orientation={Orientation.TopDown}
                >
                    <Container orientation={Orientation.LeftToRight} style={{ marginBottom: "16px" }}>
                        <Icon src={Codicon.VmRunning} style={{ fontSize: "50px", color: "cornflowerblue" }} />
                        <Icon src={Codicon.ArrowRight} style={{ fontSize: "16px", marginTop: "auto" }} />
                        <Icon
                            src={Codicon.Music}
                            style={{ fontSize: "30px", marginTop: "auto", color: "cornflowerblue" }}
                        />
                        <Label heading={true} style={{ marginLeft: "16px" }}>Transcribe a Song</Label>
                    </Container>
                    <input
                        type="file"
                        id="videoInput"
                        accept="video/*"
                        onChange={(event) => {
                            const target = event.target as HTMLInputElement;
                            if (!target.files || target.files.length === 0) {
                                return;
                            }

                            const file = target.files[0];
                            const video = document.getElementById("videoPlayer")! as HTMLVideoElement;

                            const url = URL.createObjectURL(file);
                            //video.src = url;

                            this.setState({ url }, () => {
                                video.load();
                            });
                        }}
                    />
                    <video
                        id="videoPlayer"
                        controls
                        playsinline
                        style="max-height: 300px; margin: 40px auto; display: block;"
                    />
                    <WaveformPlayer
                        url={url}
                        media={url ? "videoPlayer" : undefined}
                    />
                </Container>
            ),
            minSize: 500,
            resizable: false,
        }];

        return (
            <SplitContainer
                id="scoreLibrarySplitter"
                orientation={Orientation.LeftToRight}
                panes={panes}
                splitterSize={5}
            />
        );
    }

    private scoreTreeCellFormatter = (cell: CellComponent): string | HTMLElement => {
        const data = cell.getData() as IScoreNode;

        const host = document.createElement("div");
        host.className = "scoreTreeEntry";

        let actionBox;

        let subCaption;
        /*if (data.dataModelEntry.description) {
            subCaption = <Label className="subCaption" caption={data.dataModelEntry.description} />;
        }*/

        const content = <>
            <Icon
            //src={iconName}
            //overlays={overlays}
            //className={dimClass}
            />
            <Label id="mainCaption" caption={data.name} />
            {subCaption}
            {actionBox}
        </>;

        render(content, host);

        return host;
    };

    private handleScoreTreeDoubleClick = (e: Event, cell: CellComponent): void => {
        //const item = cell.getData() as IScoreNode;

    };

    private handleScoreTreeRowSelected = (row: RowComponent): void => {
        // const entry = row.getData() as IScoreNode;
    };

    private handleScoreTreeRowExpanded = (row: RowComponent): void => {
        const entry = row.getData() as IScoreNode;
        if (entry.expandedOnce) {
            return;
        }

        void this.loadScoreFolder("list", entry.id).then((data) => {
            entry.children = data;
            entry.expandedOnce = true;

            // Force the table to refresh.
            void row.update(entry);
        });
    };

    private handleScoreTreeRowCollapsed = (row: RowComponent): void => {
        //const entry = row.getData() as IScoreNode;
    };

    private handleScoreTreeRowContext = (event: Event, row: RowComponent): void => {
        //const entry = row.getData() as IScoreNode;
    };

    private isScoreTreeRowExpanded = (row: RowComponent): boolean => {
        const entry = row.getData() as IScoreNode;

        return entry.expanded;
    };

    private loadScoreFolder = async (action: string, parent: number): Promise<IScoreNode[]> => {
        const res = await fetch(`${getApiBase()}/api.php?action=${action}&parentid=${parent}`, {
            headers: { Accept: "application/json" },
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = (await res.json()) as IScoreDBEntry;
        const result: IScoreNode[] = [];

        data.folders.forEach((folder) => {
            result.push({
                ...folder,
                isDir: true,
                children: folder.hasChildren ? [] : undefined,
                expanded: false,
                expandedOnce: false,
            });
        });

        data.snippets.forEach((snippet) => {
            result.push({
                ...snippet,
                parentid: parent,
                isDir: false,
                expanded: false,
                expandedOnce: false,
            });
        });

        return new Promise((resolve) => {
            resolve(result);
        });
    };
};
