/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { themeNames } from "../generated/theme-names.js";

import { ComponentChild, createRef } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Checkbox } from "../components/ui/framework/Checkbox.js";
import { UIIcon } from "../components/ui/framework/UIIcon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dialog } from "../components/ui/framework/Dialog.js";
import { Dropdown, type IDropdownItem } from "../components/ui/framework/Dropdown.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Label } from "../components/ui/framework/Label.js";
import { Popup } from "../components/ui/framework/Popup.js";
import { SmuflGlyphView } from "../components/ui/framework/SmuflGlyphView.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { ComponentPlacement, UIComponent, type ICommonUIProperties }
    from "../components/ui/framework/UIComponent.js";
import { AppStorage, type IUISettings } from "../core/AppStorage.js";
import { SmuflGlyph } from "../core/smufl/SmuflGlyphs.js";
import type { ISmuflFontChoice, SmuflFontLoader } from "../core/smufl/SmuflFontLoader.js";
import { clampValue } from "../core/utils.js";
import { requisitions } from "../supplement/Requisitions.js";

/** The staff space the font samples are drawn with, which sets their size. */
const sampleStaffSpace = 6;

/** Width of one glyph box in a sample, in staff spaces. */
const sampleBoxWidth = 3;

/** Height of the glyph boxes in a sample, in staff spaces. The quarter rest is the tallest glyph. */
const sampleBoxHeight = 3;

/** Where a sample's staff lines sit, in staff spaces below the top of a glyph box. */
const sampleLineOffsets = [1, 2];

/**
 * The glyphs a sample shows. All of them are centred on their baseline, so one box size fits them
 * all. An open notehead is among them because a filled one hides how thick a font draws.
 */
const sampleGlyphs = [
    SmuflGlyph.UnpitchedPercussionClef1,
    SmuflGlyph.TimeSigCommon,
    SmuflGlyph.NoteheadHalf,
    SmuflGlyph.Repeat1Bar,
    SmuflGlyph.Rest8th,
    SmuflGlyph.RestQuarter,
];

interface ISettingsDialogState {
    /** Settings are they are currently. Might not yet be saved. */
    currentSettings: IUISettings;

    /** Settings as they were before any changes. */
    previousSettings: IUISettings;

    /** The fonts the user can pick from, refreshed once every font is loaded. */
    fontChoices: ISmuflFontChoice[];
}

export interface ISettingsDialogProperties extends ICommonUIProperties {
    /** The loader that draws the score, which knows the fonts a user can pick from. */
    fontLoader: SmuflFontLoader;
}

export class SettingsDialog extends UIComponent<ISettingsDialogProperties, ISettingsDialogState> {
    private dialogRef = createRef<Dialog>();
    private fontInfoPopupRef = createRef<Popup>();
    private fontInfoTargetRef = createRef<HTMLDivElement>();

    public constructor(props: ISettingsDialogProperties) {
        super(props);

        const currentSettings = AppStorage.loadUISettings() ?? {};

        // Deep clone to prevent mutations to previousSettings when changing currentSettings.
        const previousSettings = JSON.parse(JSON.stringify(currentSettings)) as IUISettings;

        this.state = {
            currentSettings,
            previousSettings,
            fontChoices: props.fontLoader.choices,
        };
    }

    public render(): ComponentChild {
        const { currentSettings } = this.state;
        const currentTheme = currentSettings.theme ?? "Light+";

        const darkThemes: string[] = [];
        const lightThemes: string[] = [];
        for (const [name, type] of Object.entries(themeNames)) {
            if (type === "dark") {
                darkThemes.push(name);
            } else if (type === "light") {
                lightThemes.push(name);
            }
        }

        const themeItems: IDropdownItem[] = [];

        themeItems.push({
            label: "Auto",
            onClick: () => {
                currentSettings.theme = "Auto";
                this.setState({ currentSettings }, () => {
                    this.temporarySettingsChange();
                });
            },
        });
        themeItems.push({ label: "──────────" }); // Separator

        lightThemes.forEach((themeName: string) => {
            themeItems.push({
                label: themeName,
                onClick: () => {
                    currentSettings.theme = themeName;
                    this.setState({ currentSettings }, () => {
                        this.temporarySettingsChange();
                    });
                },
            });
        });
        themeItems.push({ label: "──────────" }); // Separator
        darkThemes.forEach((themeName: string) => {
            themeItems.push({
                label: themeName,
                onClick: () => {
                    currentSettings.theme = themeName;
                    this.setState({ currentSettings }, () => {
                        this.temporarySettingsChange();
                    });
                },
            });
        });

        const currentViewerZoom = currentSettings.viewSettings?.arrangementViewSettings?.zoomLevel ?? 100;
        const musicFontRow = this.renderMusicFontRow();

        return (
            <Dialog
                ref={this.dialogRef}
                id="settingsDialog"
                onClose={this.handleClose}
                actions={[
                    <Button id="settings-button-cancel" value="cancel" caption="Cancel" />,
                    <Button id="settings-button-save" value="save" caption="Save" />
                ]}
            >
                <Container
                    className="font-bold text-lg"
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <Icon src={UIIcon.Gear} style={{ fontSize: "24px", marginRight: "8px" }} />
                    Settings
                </Container>

                <Container className="form-card" orientation={Orientation.TopDown}>
                    <Container
                        className="form-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <span className="form-row-label">Color theme</span>
                        <Dropdown
                            caption={currentTheme}
                            items={themeItems}
                            selectedItem={currentTheme}
                            closeOnSelect
                        />
                    </Container>

                    {musicFontRow}

                    <Container
                        className="form-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <span className="form-row-label">Track viewer zoom</span>
                        <Container
                            orientation={Orientation.LeftToRight}
                            crossAlignment={ChildAlignment.Center}
                        >
                            <Label caption={`${currentViewerZoom}%`} style={{ marginRight: "8px" }} />
                            <Button
                                className="zoomButton du-btn-ghost"
                                caption="-"
                                onClick={() => {
                                    const newZoom = clampValue(currentViewerZoom - 10, 50, 150);
                                    if (newZoom !== currentViewerZoom) {
                                        currentSettings.viewSettings ??= {};
                                        currentSettings.viewSettings.arrangementViewSettings ??= {};
                                        currentSettings.viewSettings.arrangementViewSettings.zoomLevel = newZoom;
                                        this.setState({ currentSettings }, () => {
                                            this.temporarySettingsChange();
                                        });
                                    }
                                }}
                            />

                            <Button
                                className="zoomButton du-btn-ghost"
                                caption="+"
                                onClick={() => {
                                    const newZoom = clampValue(currentViewerZoom + 10, 50, 150);
                                    if (newZoom !== currentViewerZoom) {
                                        currentSettings.viewSettings ??= {};
                                        currentSettings.viewSettings.arrangementViewSettings ??= {};
                                        currentSettings.viewSettings.arrangementViewSettings.zoomLevel = newZoom;
                                        this.setState({ currentSettings }, () => {
                                            this.temporarySettingsChange();
                                        });
                                    }
                                }}
                            />

                            <Button
                                caption="Reset"
                                className="resetButton du-btn-ghost"
                                onClick={() => {
                                    currentSettings.viewSettings ??= {};
                                    currentSettings.viewSettings.arrangementViewSettings ??= {};
                                    currentSettings.viewSettings.arrangementViewSettings.zoomLevel = 100;
                                    this.setState({ currentSettings }, () => {
                                        this.temporarySettingsChange();
                                    });
                                }}
                            />
                        </Container>
                    </Container>

                    <Container
                        className="form-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <span className="form-row-label">Add a bar when notes run past the last one</span>
                        <Checkbox
                            id="autoExtendOnOverflow"
                            checked={currentSettings.autoExtendOnOverflow ?? true}
                            onChange={(checked) => {
                                currentSettings.autoExtendOnOverflow = checked;
                                this.setState({ currentSettings }, () => {
                                    this.temporarySettingsChange();
                                });
                            }}
                        />
                    </Container>

                    <Container
                        className="form-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <span className="form-row-label">Show permission indicator</span>
                        <Checkbox
                            id="showPermMatrix"
                            checked={currentSettings.showPermMatrix ?? true}
                            onChange={(checked) => {
                                currentSettings.showPermMatrix = checked;
                                this.setState({ currentSettings }, () => {
                                    this.temporarySettingsChange();
                                });
                            }}
                        />
                    </Container>

                    <Container
                        className="form-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <span className="form-row-label">Show tutorial on startup</span>
                        <Checkbox
                            id="tutorialEnabled"
                            checked={currentSettings.tutorialEnabled ?? true}
                            onChange={(checked) => {
                                currentSettings.tutorialEnabled = checked;
                                this.setState({ currentSettings }, () => {
                                    this.temporarySettingsChange();
                                });
                            }}
                        />
                    </Container>
                </Container>
            </Dialog >
        );
    }

    public open(): void {
        const currentSettings = AppStorage.loadUISettings() ?? {};
        const previousSettings = JSON.parse(JSON.stringify(currentSettings)) as IUISettings;
        currentSettings.theme ??= "Light+";
        this.setState({ currentSettings, previousSettings, fontChoices: this.props.fontLoader.choices }, () => {
            this.dialogRef.current?.open();
        });

        // A sample draws in its own font, so the list is refreshed once every font has arrived.
        void this.props.fontLoader.preload().then(() => {
            this.setState({ fontChoices: this.props.fontLoader.choices });
        });
    }

    private handleClose = (returnValue: string): void => {
        const { currentSettings, previousSettings } = this.state;

        if (returnValue === "cancel" || returnValue === "") {
            const restoredSettings = JSON.parse(JSON.stringify(previousSettings)) as IUISettings;
            restoredSettings.theme ??= "Light+";
            this.setState({ currentSettings: restoredSettings }, () => {
                void requisitions.execute("settingsChanged", restoredSettings);
            });

            // The font was previewed while the dialog was open, so it has to go back as well.
            void this.switchFont(previousSettings.musicFont);
        } else {
            const newPreviousSettings = JSON.parse(JSON.stringify(currentSettings)) as IUISettings;
            this.setState({ previousSettings: newPreviousSettings });

            AppStorage.saveUISettings(currentSettings);

            // No need to notify about the settings change here because the settings are applied via
            // temporarySettingsChange when changing individual settings.
        }
    };

    private temporarySettingsChange() {
        const { currentSettings } = this.state;

        void requisitions.execute("settingsChanged", currentSettings);
    }

    private renderMusicFontRow(): ComponentChild {
        const currentFont = this.currentFont();
        if (currentFont === undefined) {
            return undefined;
        }

        const fontItems: IDropdownItem[] = this.state.fontChoices.map((choice) => {
            return {
                label: choice.name,
                detail: this.renderFontSample(choice),
                onClick: () => {
                    void this.selectFont(choice.id);
                },
            };
        });

        return (
            <Container
                className="form-row"
                orientation={Orientation.LeftToRight}
                mainAlignment={ChildAlignment.SpaceBetween}
                crossAlignment={ChildAlignment.Center}
            >
                <span className="form-row-label">Music font</span>
                <Container
                    orientation={Orientation.LeftToRight}
                    crossAlignment={ChildAlignment.Center}
                >
                    <Dropdown
                        className="music-font-dropdown"
                        caption={currentFont.name}
                        items={fontItems}
                        selectedItem={currentFont.name}
                        closeOnSelect
                    />
                    <Container
                        className="music-font-info"
                        innerRef={this.fontInfoTargetRef}
                        orientation={Orientation.LeftToRight}
                        crossAlignment={ChildAlignment.Center}
                        onPointerEnter={this.handleFontInfoEnter}
                        onPointerLeave={this.handleFontInfoLeave}
                    >
                        <Button className="music-font-info-button" caption="i" round isDefault />
                    </Container>
                </Container>
                <Popup
                    ref={this.fontInfoPopupRef}
                    id="musicFontInfo"
                    header={<Label caption={currentFont.name} />}
                    showArrow
                    placement={ComponentPlacement.BottomLeft}
                >
                    {this.renderFontInfo(currentFont)}
                </Popup>
            </Container>
        );
    }

    /**
     * Draws a sample of the font's symbols, which is the only way to tell two fonts apart before
     * choosing one. The staff lines give the glyphs their scale.
     *
     * @param choice The font to sample.
     *
     * @returns The sample to render next to the font's name.
     */
    private renderFontSample(choice: ISmuflFontChoice): ComponentChild {
        const boxWidth = sampleStaffSpace * sampleBoxWidth;
        const boxHeight = sampleStaffSpace * sampleBoxHeight;
        const sampleWidth = boxWidth * sampleGlyphs.length;

        const lines = sampleLineOffsets.map((offset) => {
            const y = sampleStaffSpace * offset;

            return <line key={offset} x1={0} x2={sampleWidth} y1={y} y2={y} />;
        });

        const samples = sampleGlyphs.map((glyph) => {
            return (
                <SmuflGlyphView
                    key={glyph}
                    glyph={glyph}
                    staffSpace={sampleStaffSpace}
                    width={sampleBoxWidth}
                    height={sampleBoxHeight}
                    fontFamily={choice.fontFamily}
                />
            );
        });

        return (
            <span className="music-font-sample" aria-hidden="true">
                <svg className="music-font-sample-staff" width={sampleWidth} height={boxHeight}>
                    {lines}
                </svg>
                {samples}
            </span>
        );
    }

    /**
     * @param font The font to describe.
     *
     * @returns The font's provenance. The licence text itself stays next to the font file, as its
     * licence requires.
     */
    private renderFontInfo(font: ISmuflFontChoice): ComponentChild {
        const rows: ComponentChild[] = [this.renderFontInfoRow("Version", font.version)];

        if (font.copyright !== undefined) {
            rows.push(this.renderFontInfoRow("Copyright", font.copyright));
        }

        rows.push(this.renderFontInfoRow("Licence", font.license.spdx));
        rows.push(this.renderFontInfoRow("Source", font.source));

        return (
            <Container className="music-font-info-content" orientation={Orientation.TopDown}>
                {rows}
            </Container>
        );
    }

    private renderFontInfoRow(label: string, value: string): ComponentChild {
        return (
            <Container className="music-font-info-row" orientation={Orientation.LeftToRight}>
                <span className="music-font-info-label">{label}</span>
                <span className="music-font-info-value">{value}</span>
            </Container>
        );
    }

    /**
     * @returns The font the score is drawn with, which is the one the row shows and explains.
     */
    private currentFont(): ISmuflFontChoice | undefined {
        const { currentSettings, fontChoices } = this.state;
        const id = currentSettings.musicFont ?? this.props.fontLoader.activeId;

        const picked = fontChoices.find((choice) => {
            return choice.id === id;
        });

        const fallback = fontChoices.find((choice) => {
            return choice.isDefault;
        }) ?? fontChoices[0];

        return picked ?? fallback;
    }

    /**
     * Switches the font the score is drawn with, which shows immediately.
     *
     * @param id The font to switch to, or undefined for the catalogue's default.
     *
     * @returns Whether the font is now the active one.
     */
    private async switchFont(id?: string): Promise<boolean> {
        const { fontLoader } = this.props;
        if (id === fontLoader.activeId) {
            return true;
        }

        if (!await fontLoader.select(id)) {
            void requisitions.execute("showError", "The selected music font could not be loaded.");

            return false;
        }

        return true;
    }

    /**
     * Switches to a font the user picked and keeps it as the pending setting. A font that does not
     * load stays out of the settings, so an unusable font is never saved.
     *
     * @param id The font to switch to.
     */
    private async selectFont(id: string): Promise<void> {
        if (!await this.switchFont(id)) {
            return;
        }

        const { currentSettings } = this.state;
        currentSettings.musicFont = this.props.fontLoader.activeId;
        this.setState({ currentSettings }, () => {
            this.temporarySettingsChange();
        });
    }

    private handleFontInfoEnter = (): void => {
        const target = this.fontInfoTargetRef.current;
        if (target !== null) {
            // The tip only informs, so it may not block what the user does next.
            this.fontInfoPopupRef.current?.open(target.getBoundingClientRect(), { blockMouseEvents: false });
        }
    };

    private handleFontInfoLeave = (): void => {
        this.fontInfoPopupRef.current?.close(false);
    };
}
