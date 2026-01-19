/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createRef, render, type ComponentChild, type ContextType } from "preact";

import type { CellComponent, ColumnDefinition, RowComponent } from "tabulator-tables";
import { TrackEditButton } from "../TrackEditButton.js";
import { bateriaInstruments } from "../bateria-instruments.js";
import { Button } from "../components/ui/framework/Button.js";
import { Card } from "../components/ui/framework/Card.js";
import { Codicon } from "../components/ui/framework/Codicon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dialog } from "../components/ui/framework/Dialog/Dialog.js";
import { Grid } from "../components/ui/framework/Grid.js";
import { GridCell } from "../components/ui/framework/GridCell.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Input } from "../components/ui/framework/Input.js";
import { Label } from "../components/ui/framework/Label.js";
import {
    SplitContainer, type ISplitterPane, type ISplitterPaneSizeInfo
} from "../components/ui/framework/SplitContainer.js";
import { TreeGrid, type ITreeGridOptions } from "../components/ui/framework/TreeGrid.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { Orientation, SelectionType } from "../components/ui/framework/ui-types.js";
import { getLibrary } from "../core/Library.js";
import { SbDmEntityType, type ISbDmScore, type ISbDmScoreFolder } from "../core/ScoreBookDataModel.js";
import { deserialiseArrangement } from "../core/serialisation/deserialisers.js";
import { getSerialisedArrangementFromParams } from "../core/serialisation/url.js";
import type { IArrangementSnapshot } from "../core/types/snapshots.js";
import { TranscriptionEditor } from "./TranscriptionEditor.js";
import { AppContext } from "./index.js";

export interface IScoreLibraryProperties extends ICommonUIProperties {
    onAction?: (action: string, dataModelEntry: ISbDmScoreFolder | ISbDmScore) => void;
}

interface IScoreLibraryState {
    /** The URL of an audio or video file. */
    url?: string;

    selectedArrangement?: IArrangementSnapshot;
    currentScore?: ISbDmScore;
}

/**
 * A component to manage a tree of scored from the server.
 * The user can select one score to load it into the player/editor.
 */
export class ScoreLibrary extends UIComponent<IScoreLibraryProperties, IScoreLibraryState> {
    public static override contextType = AppContext;
    declare public context: ContextType<typeof AppContext>;

    private scoreTableRef = createRef<TreeGrid>();
    private transcriptionEditorRef = createRef<Dialog>();

    private currentSplitterPosition: number | undefined = undefined;

    public constructor(props: IScoreLibraryProperties) {
        super(props);
        this.state = {};

        getLibrary().load(bateriaInstruments);
    }

    public render(): ComponentChild {
        const { url } = this.state;

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

        const scores = this.context.dataModel.scoreLib;

        const upperPanes: ISplitterPane[] = [{
            id: "libraryPane",
            content: (
                <Card
                    id="libraryPaneContent"
                    roundedCorners={{ topLeft: 16, topRight: 16 }}
                >
                    <Container orientation={Orientation.LeftToRight}>
                        <Icon src={Codicon.Library} style={{ fontSize: "40px", color: "cornflowerblue" }} />
                        <Label heading={true} style={{ marginLeft: "16px" }}>Score Library</Label>
                        <Button
                            imageOnly={true}
                            style={{ marginLeft: "auto", marginTop: "auto" }}
                            title="Add New Folder"
                            onClick={this.handleFolderAddClick}
                        >
                            <Icon src={Codicon.NewFolder} />
                        </Button>
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
                            tableData={scores}

                            onRowSelected={this.handleScoreTreeRowSelected}
                            onRowExpanded={this.handleScoreTreeRowExpanded}
                            onRowCollapsed={this.handleScoreTreeRowCollapsed}
                            isRowExpanded={this.isScoreTreeRowExpanded}
                            onRowContext={this.handleScoreTreeRowContext}
                        />
                    </Container>
                </Card >
            ),
            minSize: 350,
            initialSize: this.currentSplitterPosition ?? 350,
            resizable: true,
        }, {
            id: "scoreDetailsPane",
            content: (
                <Container
                    id="scoreDetailsPaneContent"
                    orientation={Orientation.TopDown}
                >
                    {this.renderSelectedScoreDetails()}
                </Container>
            ),
            minSize: 400,
            resizable: false,
            stretch: true,
        }];

        const tracks: Array<{ caption?: string; }> = [{}, {}, {}, {}];

        return (
            <Container id="scoreLibraryRoot" orientation={Orientation.TopDown} style={{ flex: "1 1 auto" }}>
                <Dialog ref={this.transcriptionEditorRef} >
                    <TranscriptionEditor url={url ?? ""} />
                </Dialog>

                <SplitContainer
                    id="scoreLibrarySplitter"
                    orientation={Orientation.LeftToRight}
                    panes={upperPanes}
                    splitterSize={5}
                    onPaneResized={this.handlePanelResize}
                />
                <Card
                    id="tracksCard"
                    orientation={Orientation.LeftToRight}
                    roundedCorners={{ bottomLeft: 16, bottomRight: 16 }}
                >
                    <Container orientation={Orientation.LeftToRight}>
                        <Icon src={Codicon.VmRunning} style={{ fontSize: "40px", color: "cornflowerblue" }} />
                        <Icon
                            src={Codicon.ArrowRight}
                            style={{ fontSize: "16px", alignSelf: "flex-end" }}
                        />
                        <Icon
                            src={Codicon.Music}
                            style={{ fontSize: "25px", color: "cornflowerblue", alignSelf: "flex-end" }}
                        />
                    </Container>

                    <Label
                        heading={true}
                        style={{ margin: "0 16px", alignSelf: "center" }}>
                        Current Tracks
                    </Label>
                    {tracks.map((track, index) => {
                        return (
                            <TrackEditButton
                                caption={track.caption}
                                onClick={this.handleTrackEditButtonClick}
                            />
                        );
                    })}
                </Card>
            </Container>
        );
    }

    private renderSelectedScoreDetails(): import("preact").ComponentChildren {
        const { selectedArrangement, currentScore } = this.state;

        let title = "--";
        let description: string | undefined;
        let tempo = "--";
        let timeSignature = "--";
        let length = "--";

        let instrumentImages: Array<[string, string]> = [];
        if (selectedArrangement && currentScore) {
            title = selectedArrangement.title ?? "(Untitled)";
            tempo = selectedArrangement.timeParams.tempo.toString();
            timeSignature = selectedArrangement.timeParams.timeSignature;
            length = selectedArrangement.timeParams.length.toString();
            instrumentImages = selectedArrangement.tracks.map((track) => {
                const instrument = getLibrary().getInstrument(track.instrumentId);

                return [instrument.icon, instrument.displayName];
            });

            description = currentScore.description;
        }

        return (
            <Grid
                id="scoreDetailsGrid"
                columns={["20%", "20%", "auto"]}
                rowGap={8}
                style={{ margin: "16px" }}
            >
                <GridCell columnSpan={3}>
                    <Icon src={Codicon.Output} style={{ fontSize: "40px", color: "cornflowerblue" }} />
                    <Label heading={true} style={{ marginLeft: "16px" }}>{title}</Label>
                </GridCell>
                <GridCell>
                    <Label caption="Length:" className="scoreDetailsPropertyName" />
                </GridCell>
                <GridCell>
                    <Label caption={`${length} bars`} className="scoreDetailsPropertyValue" />
                </GridCell>
                <GridCell orientation={Orientation.TopDown} rowSpan={3}>
                    <Label
                        caption="Instruments:"
                        className="scoreDetailsPropertyName"
                        style={{ marginBottom: "8px" }}
                    />
                    <Container orientation={Orientation.LeftToRight} style={{ flexWrap: "wrap" }}>
                        {
                            instrumentImages.map(([imgSrc, altText]) => {
                                return (
                                    <img
                                        src={imgSrc}
                                        alt={altText}
                                        title={altText}
                                        className="instrumentImage"
                                        style={{ width: "64px", height: "64px", marginRight: "8px" }}
                                    />
                                );
                            })
                        }
                    </Container>
                </GridCell>
                <GridCell>
                    <Label caption="Tempo:" className="scoreDetailsPropertyName" />
                </GridCell>
                <GridCell>
                    <Label caption={`${tempo} bpm`} className="scoreDetailsPropertyValue" />
                </GridCell>
                <GridCell>
                    <Label caption="Meter:" className="scoreDetailsPropertyName" />
                </GridCell>
                <GridCell>
                    <Label caption={timeSignature} className="scoreDetailsPropertyValue" />
                </GridCell>
                <GridCell id="scoreDetailsDescription" columnSpan={3} >
                    <Label caption="Notes:" className="scoreDetailsPropertyName" />
                    <Input
                        id="scoreNotes"
                        value={description}
                        placeholder="Enter other details here"
                        multiLine
                        multiLineCount={5}
                        style={{ width: "100%", fieldSizing: "content" }}
                    />
                </GridCell>
            </Grid>
        );

    }

    private scoreTreeCellFormatter = (cell: CellComponent): string | HTMLElement => {
        const data = cell.getData() as ISbDmScoreFolder | ISbDmScore;

        const host = document.createElement("div");
        host.className = "scoreTreeEntry";

        let actionBox;
        let iconSrc: Codicon;
        if (data.type === SbDmEntityType.ScoreFolder) {
            iconSrc = data.state.expanded ? Codicon.FolderOpened : Codicon.Folder;
        } else {
            const { onAction } = this.props;

            iconSrc = Codicon.Music;

            const playButton = <Button
                className="playButton actionButton"
                data-tooltip="Play Score"
                imageOnly
                onClick={() => {
                    onAction?.("play", data);
                }}
            >
                <Icon src={Codicon.Play} data-tooltip="inherit" />
            </Button>;

            const editButton = <Button
                className="editButton actionButton"
                data-tooltip="Edit Score"
                imageOnly
                onClick={() => {
                    onAction?.("edit", data);
                }}
            >
                <Icon src={Codicon.Edit} data-tooltip="inherit" />
            </Button>;

            const removeButton = <Button
                className="removeButton actionButton"
                data-tooltip="Remove Score"
                imageOnly
                onClick={() => {
                    onAction?.("remove", data);
                }}
            >
                <Icon src={Codicon.Trash} data-tooltip="inherit" />
            </Button>;

            actionBox = <Container className="actionBox" orientation={Orientation.LeftToRight}>
                {playButton}
                {editButton}
                {removeButton}
            </Container>;

        }

        let subCaption;
        /*if (data.dataModelEntry.description) {
            subCaption = <Label className="subCaption" caption={data.dataModelEntry.description} />;
        }*/

        const content = <>
            <Icon
                src={iconSrc}
                className={"scoreTreeIcon"}
            />
            <Label caption={data.name} />
            {subCaption}
            {actionBox}
        </>;

        render(content, host);

        return host;
    };

    private handleScoreTreeDoubleClick = (e: Event, cell: CellComponent): void => {
        //const item = cell.getData() as ISbDmScoreFolder | ISbDmScore;

    };

    private handleScoreTreeRowSelected = (row: RowComponent): void => {
        const entry = row.getData() as ISbDmScoreFolder | ISbDmScore;
        if (entry.type === SbDmEntityType.Score) {
            const params = new URLSearchParams(entry.content);
            const serialisedArrangement = getSerialisedArrangementFromParams(params);
            if (serialisedArrangement) {
                const arrangement = deserialiseArrangement(serialisedArrangement);
                arrangement.title = entry.name;
                this.setState({ selectedArrangement: arrangement, currentScore: entry });

                return;
            }
        }

        this.setState({ selectedArrangement: undefined, currentScore: undefined });
    };

    private handleScoreTreeRowExpanded = (row: RowComponent): void => {
        const entry = row.getData() as ISbDmScoreFolder;
        if (entry.state.expandedOnce) {
            return;
        }

        void entry.refresh?.().then(() => {
            entry.state.expandedOnce = true;

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
        const entry = row.getData() as ISbDmScoreFolder;

        return entry.state.expanded;
    };

    private handleFolderAddClick = (): void => {
        const folderName = prompt("Enter the name of the new folder:");

        if (!folderName) {
            return;
        }

        void this.context.dataModel.addScoreFolder(folderName).then(() => {
            this.forceUpdate();
        });
    };

    private handleTrackEditButtonClick = (): void => {
        this.transcriptionEditorRef.current?.open();
    };

    private handlePanelResize = (info: ISplitterPaneSizeInfo[]): void => {
        this.currentSplitterPosition = info[0].currentSize;
    };
};
