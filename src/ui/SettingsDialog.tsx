/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { themeNames } from "../generated/theme-names.js";

import { ComponentChild, createRef } from "preact";

import { Button } from "../components/ui/framework/Button.js";
import { Checkbox } from "../components/ui/framework/Checkbox.js";
import { Codicon } from "../components/ui/framework/Codicon.js";
import { Container } from "../components/ui/framework/Container.js";
import { Dialog } from "../components/ui/framework/Dialog.js";
import { Dropdown, type IDropdownItem } from "../components/ui/framework/Dropdown.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { UIComponent } from "../components/ui/framework/UIComponent.js";
import { AppStorage, type IUISettings } from "../core/AppStorage.js";
import { clampValue } from "../core/utils.js";
import { requisitions } from "../supplement/Requisitions.js";
import { Label } from "../components/ui/framework/Label.js";

interface ISettingsDialogState {
    /** Settings are they are currently. Might not yet be saved. */
    currentSettings: IUISettings;

    /** Settings as they were before any changes. */
    previousSettings: IUISettings;
}

export class SettingsDialog extends UIComponent<{}, ISettingsDialogState> {
    private dialogRef = createRef<Dialog>();

    public constructor(props: {}) {
        super(props);

        const currentSettings = AppStorage.loadUISettings() ?? {};

        // Deep clone to prevent mutations to previousSettings when changing currentSettings.
        const previousSettings = JSON.parse(JSON.stringify(currentSettings)) as IUISettings;

        this.state = {
            currentSettings,
            previousSettings,
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
                    <Icon src={Codicon.Gear} style={{ fontSize: "24px", marginRight: "8px" }} />
                    Settings
                </Container>

                <Container className="settings-card" orientation={Orientation.TopDown}>
                    <Container
                        className="settings-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <span className="settings-row-label">Color theme</span>
                        <Dropdown
                            caption={currentTheme}
                            items={themeItems}
                            selectedItem={currentTheme}
                            closeOnSelect
                        />
                    </Container>

                    <Container
                        className="settings-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <span className="settings-row-label">Track viewer zoom</span>
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
                        className="settings-row"
                        orientation={Orientation.LeftToRight}
                        mainAlignment={ChildAlignment.SpaceBetween}
                        crossAlignment={ChildAlignment.Center}
                    >
                        <span className="settings-row-label">Show permission matrix</span>
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
                </Container>
            </Dialog >
        );
    }

    public open(): void {
        const currentSettings = AppStorage.loadUISettings() ?? {};
        const previousSettings = JSON.parse(JSON.stringify(currentSettings)) as IUISettings;
        currentSettings.theme ??= "Light+";
        this.setState({ currentSettings, previousSettings }, () => {
            this.dialogRef.current?.open();
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
}
