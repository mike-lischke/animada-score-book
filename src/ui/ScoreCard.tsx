/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Container } from "../components/ui/framework/Container.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { Menu } from "../components/ui/framework/Menu/Menu.js";
import type { IMenuItem } from "../components/ui/framework/Menu/MenuItem.js";
import { TagInput, type ITag } from "../components/ui/framework/TagInput.js";
import { UIIcon } from "../components/ui/framework/UIIcon.js";
import { UIComponent, type ICommonUIProperties } from "../components/ui/framework/UIComponent.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { ScoreLineupStatus, type IScoreLineupTrack } from "../core/DatabaseTypes.js";
import {
    InstrumentRole, type ISbDmInstrument, type ISbDmScore,
} from "../core/ScoreBookDataModel.js";
import { PermIndicator } from "./PermIndicator.js";

/** The order the lineup sections follow, from the pulse up to the effects. */
const roleOrder: Array<InstrumentRole | undefined> = [
    InstrumentRole.GroundRhythm,
    InstrumentRole.Carpet,
    InstrumentRole.Voice,
    InstrumentRole.HandRhythm,
    InstrumentRole.Accompaniment,
    InstrumentRole.Effect,
    undefined,
];

/** The heading of each lineup section. An instrument without a role lands in the last one. */
const roleCaptions = new Map<InstrumentRole | undefined, string>([
    [InstrumentRole.GroundRhythm, "Surdos & Bass"],
    [InstrumentRole.Carpet, "Rhythm & Snare"],
    [InstrumentRole.Voice, "Metals & High Tones"],
    [InstrumentRole.HandRhythm, "Hand Drums"],
    [InstrumentRole.Accompaniment, "Accompaniment"],
    [InstrumentRole.Effect, "Effects"],
    [undefined, "Other"],
]);

/** One track as the lineup shows it. Two tracks of one instrument are two rows. */
interface ILineupRow {
    trackId: number;
    name: string;
    icon?: string;
    color?: string;
}

/** One heading of the lineup with the tracks below it. */
interface ILineupSection {
    caption: string;
    color?: string;
    rows: ILineupRow[];
}

export interface IScoreCardProperties extends ICommonUIProperties {
    score: ISbDmScore;

    /** The position of the card in the list, which the ordinal badge shows. */
    position: number;

    /** The instruments the lineup resolves its type ids against. */
    instruments: readonly ISbDmInstrument[];

    /** The tags of the score that the card shows as chips; instrument tags are never part of it. */
    tagChips: ITag[];

    expanded: boolean;
    isAdmin: boolean;

    /** Whether the permission matrix is shown at all, which a setting turns off. */
    showPermission: boolean;

    onToggleLineup: (score: ISbDmScore) => void;
    onOpen: (score: ISbDmScore) => void;
    onAction: (action: string, score: ISbDmScore) => void;
}

/**
 * One score of the collection: its identity and actions, the tags the caller may see, and a lineup that opens on
 * demand. The lineup lists the score's own tracks, so several tracks of one instrument stay visible; it never shows
 * player counts or roles the score does not hold.
 */
export class ScoreCard extends UIComponent<IScoreCardProperties> {
    public render(): ComponentChild {
        const { score, expanded } = this.props;
        const lineupId = `score-card-lineup-${score.id}`;
        const className = this.generateFinalClassName(
            [expanded ? "score-card-expanded" : "score-card-collapsed", "score-card"],
        );
        const header = this.renderHeader();
        const toggle = this.renderLineupToggle(lineupId);
        const lineup = this.renderLineup(lineupId);

        return (
            <Container
                className={className}
                orientation={Orientation.TopDown}
                data-score-id={score.id}
                data-entry-id={score.id}
                data-entry-type={String(score.type)}
            >
                {header}
                {toggle}
                {lineup}
            </Container>
        );
    }

    private static rowOf(track: IScoreLineupTrack, instrument: ISbDmInstrument | undefined): ILineupRow {
        if (instrument === undefined) {
            return {
                trackId: track.trackId,
                name: `Unknown instrument ${track.instrumentTypeId}`,
            };
        }

        return {
            trackId: track.trackId,
            name: instrument.displayName,
            icon: instrument.image.filePath,
            color: instrument.color,
        };
    }

    private renderHeader(): ComponentChild {
        const { score, position, tagChips, isAdmin, showPermission } = this.props;

        const { perm } = score;
        const canManage = isAdmin || (perm?.isOwner === true);

        const menuItems: IMenuItem[] = [
            { id: "load", label: "Load Score" },
            { id: "copyUrl", label: "Copy Score URL", icon: UIIcon.Link },
            { id: "separator2", label: "-" },
            { id: "remove", label: "Remove Score", icon: UIIcon.Trash },
        ];

        if (canManage) {
            menuItems.push(
                { id: "separator3", label: "-" },
                { id: "managePerm", label: "Group Access", icon: UIIcon.Key },
            );
        }

        let indicator: ComponentChild = undefined;
        if (showPermission && perm !== undefined) {
            indicator = (
                <PermIndicator
                    canWrite={perm.canWrite}
                    isWorld={perm.isWorld}
                    canManage={canManage}
                    onManage={canManage ? this.handleManagePermissions : undefined}
                />
            );
        }

        let chips: ComponentChild = undefined;
        if (tagChips.length > 0) {
            chips = <TagInput className="score-card-tags" tags={tagChips} readOnly />;
        }

        return (
            <Container className="score-card-header" orientation={Orientation.LeftToRight}
                crossAlignment={ChildAlignment.Center}>
                <Icon src={UIIcon.Music} className="score-card-icon" />
                <Container className="score-card-identity" orientation={Orientation.TopDown}>
                    <Container className="score-card-title-row" orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}>
                        <Label className="score-card-position" caption={`#${position}`} />
                        <Button
                            className="score-card-open"
                            plain={true}
                            title={`Open ${score.name}`}
                            onClick={this.handleOpenClick}
                        >
                            <span className="score-card-name" title={score.name}>{score.name}</span>
                        </Button>
                    </Container>
                    {chips}
                </Container>
                {indicator}
                <Container className="score-card-actions" orientation={Orientation.LeftToRight}>
                    <Menu
                        icon={UIIcon.KebabVertical}
                        items={menuItems}
                        onItemClick={this.handleMenuItemClick}
                    />
                </Container>
            </Container>
        );
    }

    private renderLineupToggle(lineupId: string): ComponentChild {
        const { score, expanded } = this.props;
        const voiceCount = score.lineup?.tracks.length ?? 0;
        const caption = voiceCount === 1 ? "Lineup (1 voice)" : `Lineup (${voiceCount} voices)`;

        return (
            <Button
                id={`score-card-lineup-toggle-${score.id}`}
                className="score-card-lineup-toggle"
                plain={true}
                ariaExpanded={expanded}
                ariaControls={lineupId}
                onClick={this.handleToggleClick}
            >
                <Icon src={UIIcon.Organization} />
                <Label className="score-card-lineup-caption" caption={caption} />
                <Icon src={UIIcon.ChevronDown} className="score-card-chevron" />
            </Button>
        );
    }

    private renderLineup(lineupId: string): ComponentChild {
        const { expanded } = this.props;

        if (!expanded) {
            return undefined;
        }

        const sections = this.buildSections();
        let content: ComponentChild;
        if (sections.length > 0) {
            content = sections.map((section) => {
                return this.renderSection(section);
            });
        } else {
            content = <Label className="score-card-lineup-note" caption={this.lineupNote()} wrap={true} />;
        }

        return (
            <Container id={lineupId} className="score-card-lineup" orientation={Orientation.TopDown}>
                {content}
            </Container>
        );
    }

    private renderSection(section: ILineupSection): ComponentChild {
        const rows = section.rows.map((row) => {
            if (row.icon === undefined) {
                return (
                    <Container key={row.trackId} className="score-card-track" orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}>
                        <span className="score-card-track-name">{row.name}</span>
                    </Container>
                );
            }

            return (
                <Container key={row.trackId} className="score-card-track" orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}>
                    <img className="score-card-track-icon" src={row.icon} alt="" />
                    <span className="score-card-track-name">{row.name}</span>
                </Container>
            );
        });

        return (
            <Container key={section.caption} className="score-card-lineup-section" orientation={Orientation.TopDown}>
                <Container className="score-card-lineup-heading" orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}>
                    <span className="score-card-role-dot" style={{ backgroundColor: section.color }} />
                    <Label className="score-card-role-caption" caption={section.caption} />
                </Container>
                {rows}
            </Container>
        );
    }

    /**
     * @returns The lineup grouped by the role of its instruments, in pulse-to-effect order. Tracks without a known
     * instrument keep their place in the last section and are named by their type.
     */
    private buildSections(): ILineupSection[] {
        const { score, instruments } = this.props;
        const tracks = score.lineup?.status === ScoreLineupStatus.Ok ? score.lineup.tracks : [];

        const byTypeId = new Map(instruments.map((instrument) => {
            return [instrument.typeId, instrument];
        }));

        const grouped = new Map<InstrumentRole | undefined, ILineupRow[]>();
        for (const track of tracks) {
            const instrument = byTypeId.get(track.instrumentTypeId);
            const role = instrument?.role;
            const rows = grouped.get(role) ?? [];

            rows.push(ScoreCard.rowOf(track, instrument));
            grouped.set(role, rows);
        }

        const sections: ILineupSection[] = [];
        for (const role of roleOrder) {
            const rows = grouped.get(role);
            if (rows === undefined || rows.length === 0) {
                continue;
            }

            sections.push({
                caption: roleCaptions.get(role) ?? "Other",
                color: rows[0].color,
                rows,
            });
            grouped.delete(role);
        }

        return sections;
    }

    /**
     * @returns The message shown instead of a lineup the score does not provide.
     */
    private lineupNote(): string {
        const { score } = this.props;
        const lineup = score.lineup;

        if (lineup === undefined) {
            return "The lineup of this score is not known yet.";
        }

        switch (lineup.status) {
            case ScoreLineupStatus.Ok: {
                return "This score holds no tracks.";
            }

            case ScoreLineupStatus.Unsupported: {
                return "This score was saved by a newer version of the app, so its lineup cannot be shown here.";
            }

            case ScoreLineupStatus.Unreadable: {
                return "The content of this score cannot be read, so its lineup is unavailable.";
            }
        }
    }

    private handleOpenClick = (): void => {
        const { score, onOpen } = this.props;

        onOpen(score);
    };

    private handleToggleClick = (): void => {
        const { score, onToggleLineup } = this.props;

        onToggleLineup(score);
    };

    private handleManagePermissions = (): void => {
        this.handleMenuItemClick("managePerm");
    };

    private handleMenuItemClick = (id: string): void => {
        const { score, onAction } = this.props;

        onAction(id, score);
    };
}
