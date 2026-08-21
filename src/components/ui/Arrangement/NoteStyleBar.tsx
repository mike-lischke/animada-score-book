/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import type { ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import type { IAudioData } from "../../../core/types/general.js";
import { requisitions } from "../../../supplement/Requisitions.js";
import type { SelectionManager } from "../../../ui/SelectionManager.js";
import { NoteStyleSymbolViewer } from "../Note/NoteStyleSymbolViewer.js";
import { Button } from "../framework/Button.js";
import { Container } from "../framework/Container.js";
import { GooeyGroup } from "../framework/GooeyGroup.js";
import { Label } from "../framework/Label.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";

export interface INoteStyleBarProps extends ICommonUIProperties {
    dataModel: ScoreBookDataModel;
    selectionManager: SelectionManager;
}

interface INoteStyleBarState {
    noteStyles: IAudioData[];
}

/**
 * Button bar showing the note styles of the currently selected track.
 * Clicking a style enters that note at the current grid cursor position.
 */
export class NoteStyleBar extends UIComponent<INoteStyleBarProps, INoteStyleBarState> {
    public constructor(props: INoteStyleBarProps) {
        super(props);

        this.state = {
            noteStyles: [],
        };
    }

    public override componentDidMount(): void {
        requisitions.register("selectionChanged", this.handleSelectionChanged);
        this.refreshFromSelection();
    }

    public override componentWillUnmount(): void {
        requisitions.unregister("selectionChanged", this.handleSelectionChanged);
    }

    public override render(): ComponentChild {
        const { noteStyles } = this.state;

        const buttons = noteStyles.map((style, index) => {
            const tooltip = style.symbol?.description ?? style.symbol?.shortDescription ?? style.id;

            return (
                <Button
                    key={style.id}
                    plain
                    className="noteStyleButton"
                    data-tooltip={`${tooltip} (${index + 1})`}
                    onClick={() => {
                        void requisitions.execute("noteEntryRequested", style.id);
                    }}
                >
                    <NoteStyleSymbolViewer noteStyle={style} data-tooltip="inherit" />
                </Button>
            );
        });

        let label: ComponentChild;
        if (noteStyles.length > 0) {
            label = <Label caption="Note Styles" className="noteStyleLabel" />;
        }

        return (
            <Container
                className="noteStyleBarHost"
                orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}
                style={{ flex: 1, minWidth: 0 }}
            >
                {label}
                <GooeyGroup
                    className="noteStyleBar"
                    background="var(--color-base-200)"
                    style={{ flex: 1, minWidth: 0, overflowX: "auto" }}
                >
                    {buttons}
                </GooeyGroup>
            </Container>
        );
    }

    private handleSelectionChanged = (): Promise<boolean> => {
        this.refreshFromSelection();

        return Promise.resolve(true);
    };

    private refreshFromSelection(): void {
        const { dataModel, selectionManager } = this.props;

        const entries = [...selectionManager.currentSelection.values()];
        const trackId = entries.length > 0 ? entries[0].trackId : undefined;
        const track = trackId === undefined
            ? undefined
            : dataModel.arrangement?.tracks.find((candidate) => {
                return candidate.id === trackId;
            });
        const noteStyles = track ? Object.values(track.instrument.noteStyles) : [];

        this.setState({ noteStyles });
    }
}
