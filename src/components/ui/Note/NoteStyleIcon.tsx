/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ComponentChild, VNode } from "preact";

import {
    Damping, ExcitationMode, HandTechnique, NoteDisplayType, StickTechnique,
    type NoteCharacteristics,
} from "../../../core/ScoreBookDataModel.js";
import type { IAudioData } from "../../../core/types/general.js";
import { NoteImage, NoteKind, NoteLength } from "../framework/NoteImage.js";
import { UIComponent, type ICommonUIProperties } from "../framework/UIComponent.js";

export interface INoteStyleIconProps extends ICommonUIProperties {
    noteStyle?: IAudioData;
}

/**
 * Renders the note head of a note style the way it appears in the score. The shape and the
 * technique decoration (slap cross, rim line, press roll etc.) are derived from the style's play
 * characteristics, so every instrument voice shows its own recognisable note symbol. Articulation
 * (accent, damping, ghost) is intentionally not shown here — it lives in the articulation toolbar.
 */
export class NoteStyleIcon extends UIComponent<INoteStyleIconProps> {
    public override render(): ComponentChild {
        const { noteStyle } = this.props;

        if (!noteStyle) {
            return null;
        }

        const displayType = this.resolveDisplayType(noteStyle.characteristics);
        const diamondOpen = this.resolveDiamondOpen(noteStyle, displayType);
        const decorations = this.resolveDecorations(noteStyle);

        const headClassName = this.generateFinalClassName([
            "note-style-icon-head",
            this.headClass(displayType),
            this.classFromProperty(diamondOpen, "hollow"),
        ]);

        const head = displayType === NoteDisplayType.Oval
            ? (
                <NoteImage
                    className="note-style-icon-note-image"
                    kind={NoteKind.Note}
                    value={NoteLength.Quarter}
                    headType={NoteDisplayType.Oval}
                    hideStem={true}
                    flagCount={0}
                    width={28}
                    height={56}
                    alt=""
                />
            )
            : null;

        return (
            <span className="note-style-icon" {...this.dataAttributes}>
                <span className={headClassName}>{head}</span>
                {decorations}
            </span>
        );
    }

    private resolveDisplayType(characteristics: NoteCharacteristics | undefined): NoteDisplayType {
        if (characteristics === undefined || !("mainDisplayType" in characteristics)) {
            return NoteDisplayType.Oval;
        }

        return characteristics.mainDisplayType!;
    }

    private resolveDiamondOpen(noteStyle: IAudioData, displayType: NoteDisplayType): boolean {
        if (displayType !== NoteDisplayType.Diamond) {
            return false;
        }

        return noteStyle.sampleProfile.builtInDamping === Damping.Open;
    }

    /**
     * Renders the technique-specific decorations that accompany the note head in the score.
     *
     * @param noteStyle The note style whose characteristics determine the decorations.
     *
     * @returns The decoration nodes, possibly empty.
     */
    private resolveDecorations(noteStyle: IAudioData): ComponentChild[] {
        const { characteristics } = noteStyle;
        const nodes: ComponentChild[] = [];

        if (characteristics.excitationMode === ExcitationMode.Struck) {
            if ("stickTechnique" in characteristics && characteristics.stickTechnique !== undefined) {
                switch (characteristics.stickTechnique) {
                    case StickTechnique.PressRoll: {
                        nodes.push(this.renderPressRoll());
                        break;
                    }

                    case StickTechnique.Rim: {
                        nodes.push(<span key="rim" className="note-style-icon-rim-line" />);
                        break;
                    }

                    case StickTechnique.RimShot: {
                        nodes.push(this.renderCross(
                            "rimshot", "note-style-icon-rimshot-cross", 8, 8, "currentColor",
                        ));
                        break;
                    }

                    case StickTechnique.Body: {
                        nodes.push(<span key="body" className="note-style-icon-body-stick" />);
                        break;
                    }

                    case StickTechnique.CrossClick: {
                        nodes.push(<span key="crossclick" className="note-style-icon-crossclick-line" />);
                        break;
                    }

                    default: {
                        break;
                    }
                }
            } else {
                switch (characteristics.handTechnique) {
                    case HandTechnique.Thumb: {
                        nodes.push(<span key="thumb" className="note-style-icon-thumb-circle" />);
                        break;
                    }

                    case HandTechnique.Tap:
                    case HandTechnique.TapWithPalm: {
                        nodes.push(<span key="tap" className="note-style-icon-tap-triangle" />);
                        break;
                    }

                    case HandTechnique.Slap: {
                        nodes.push(this.renderCross(
                            "slap", "note-style-icon-slap-cross", 10, 10, "var(--note-style-icon-hole)",
                        ));
                        break;
                    }

                    default: {
                        break;
                    }
                }

                // Hand + Cross display → hollow square around the cross (body).
                if (characteristics.mainDisplayType === NoteDisplayType.Cross) {
                    nodes.push(<span key="body-hand" className="note-style-icon-body-hand" />);
                }
            }
        } else if (characteristics.excitationMode === ExcitationMode.Scraped) {
            nodes.push(<span key="scraped" className="note-style-icon-scraped" />);
        } else if (characteristics.excitationMode === ExcitationMode.Blown) {
            nodes.push(<span key="blown" className="note-style-icon-blown">~</span>);
        }

        return nodes;
    }

    /**
     * Renders a small cross decoration as an inline SVG.
     *
     * @param key The React key for the node.
     * @param className The CSS class for positioning.
     * @param width The rendered width in px.
     * @param height The rendered height in px.
     * @param stroke The stroke colour, usually currentColor or the hole colour.
     *
     * @returns The cross SVG node.
     */
    private renderCross(key: string, className: string, width: number, height: number, stroke: string): VNode {
        return (
            <svg key={key} className={className} width={width} height={height}
                viewBox="0 0 14 14" aria-hidden="true"
                style={{ stroke, strokeWidth: 3, strokeLinecap: "round", overflow: "visible" }}>
                <line x1="2" y1="2" x2="12" y2="12" />
                <line x1="12" y1="2" x2="2" y2="12" />
            </svg>
        );
    }

    /**
     * Renders the three diagonal press-roll slashes as an inline SVG.
     *
     * @returns The press-roll SVG node.
     */
    private renderPressRoll(): VNode {
        return (
            <svg key="press-roll" className="note-style-icon-press-roll" width={10} height={16}
                viewBox="0 0 14 35" aria-hidden="true"
                style={{ stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", overflow: "visible" }}>
                <line x1="12" y1="3" x2="2" y2="8" />
                <line x1="12" y1="9" x2="2" y2="14" />
                <line x1="12" y1="15" x2="2" y2="20" />
            </svg>
        );
    }

    private headClass(displayType: NoteDisplayType): string {
        switch (displayType) {
            case NoteDisplayType.Cross: {
                return "cross";
            }

            case NoteDisplayType.Diamond: {
                return "diamond";
            }

            case NoteDisplayType.Square: {
                return "square";
            }

            case NoteDisplayType.Triangle: {
                return "triangle";
            }

            default: {
                return "oval";
            }
        }
    }
}
