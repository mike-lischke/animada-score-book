/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type ComponentChild } from "preact";

import type { ISbDmArrangement, ScoreBookDataModel } from "../../../core/ScoreBookDataModel.js";
import { ArrangementTitle } from "../Arrangement/ArrangementTitle.js";
import { Badge, BadgeVariant } from "../framework/Badge.js";
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
    compact?: boolean;
}

/** The header's arrangement identity: its name with the save state, and its performance stats below. */
export class ArrangementIdentity extends UIComponent<IArrangementIdentityProps> {
    public override render(): ComponentChild {
        const { className, stats, compact } = this.props;
        const title = this.renderTitle();
        const badge = compact ? undefined : this.renderSaveBadge();
        const statsLabel = compact
            ? undefined : <Label id="scoreStats" className="arrangementIdentityStats" caption={stats} />;

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
                    <Label className="arrangementIdentitySection" caption="Score Library" />
                    <Label className="arrangementIdentityChevron" caption={"\u203a"} />
                    {title}
                    {badge}
                </Container>
                {statsLabel}
            </Container>
        );
    }

    private renderTitle(): ComponentChild {
        const { arrangement, dataModel, editMode, stats, compact } = this.props;
        if (compact) {
            return (
                <Label id="arrangementIdentityTitle">
                    {arrangement.title}
                    <span className="arrangementIdentityStats">{` \u2022 ${stats}`}</span>
                </Label>
            );
        }

        return (
            <ArrangementTitle id="arrangementIdentityTitle" arrangement={arrangement}
                dataModel={dataModel} editMode={editMode} />
        );
    }

    private renderSaveBadge(): ComponentChild {
        const { saveState } = this.props;

        let saveCaption: string;
        let badgeVariant: BadgeVariant;
        switch (saveState) {
            case ArrangementSaveState.Saved: {
                saveCaption = "Saved";
                badgeVariant = BadgeVariant.Success;

                break;
            }

            case ArrangementSaveState.Unsaved: {
                saveCaption = "Unsaved changes";
                badgeVariant = BadgeVariant.Warning;

                break;
            }

            default: {
                saveCaption = "Unchanged";
                badgeVariant = BadgeVariant.Neutral;

                break;
            }
        }

        return <Badge className="arrangementSaveChip" variant={badgeVariant} caption={saveCaption} />;
    }
}
