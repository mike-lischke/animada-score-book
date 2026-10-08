/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild } from "preact";

import type { ISbDmArrangement, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { ArrangementTitle } from "../Arrangement/ArrangementTitle.js";
import { Container } from "../framework/Container.js";
import { Label } from "../framework/Label.js";
import { ChildAlignment, Orientation } from "../framework/ui-types.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

/** How the current score stands towards the backend. */
export enum ArrangementSaveState {
    /** The score was loaded and has not been changed since. */
    Unchanged,

    /** The score was saved during this session. */
    Saved,

    /** The score has changes that are not saved. */
    Unsaved,
}

export interface IArrangementIdentityProps extends ICommonUIProperties {
    arrangement: Readonly<ISbDmArrangement>;
    dataModel: ScoreBookDataModel;
    editMode: boolean;

    /** Performance metrics of the arrangement, shown below its name. */
    stats: string;

    /** How the current score stands towards the backend. */
    saveState: ArrangementSaveState;
}

/** The header's arrangement identity: its name with the save state, and its performance stats below. */
export class ArrangementIdentity extends UIComponent<IArrangementIdentityProps> {
    public override render(): ComponentChild {
        const { className, arrangement, dataModel, editMode, stats, saveState } = this.props;

        let saveCaption: string;
        let saveClass: string;
        switch (saveState) {
            case ArrangementSaveState.Saved: {
                saveCaption = "Saved";
                saveClass = "arrangementSaveChip-saved";

                break;
            }

            case ArrangementSaveState.Unsaved: {
                saveCaption = "Unsaved changes";
                saveClass = "arrangementSaveChip-unsaved";

                break;
            }

            default: {
                saveCaption = "Unchanged";
                saveClass = "arrangementSaveChip-unchanged";

                break;
            }
        }

        return (
            <Container
                className={this.generateFinalClassName(["arrangementIdentity", className])}
                orientation={Orientation.TopDown}
                mainAlignment={ChildAlignment.Center}
                crossAlignment={ChildAlignment.Start}
                {...this.dataAttributes}
            >
                <Container
                    className="arrangementIdentityRow"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <ArrangementTitle
                        id="arrangementIdentityTitle"
                        arrangement={arrangement}
                        dataModel={dataModel}
                        editMode={editMode}
                    />
                    <Label className={`arrangementSaveChip ${saveClass}`} caption={saveCaption} />
                </Container>
                <Label id="scoreStats" className="arrangementIdentityStats" caption={stats} />
            </Container>
        );
    }
}
