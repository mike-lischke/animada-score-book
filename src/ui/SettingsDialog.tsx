/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { themeNames } from "../generated/theme-names.js";

import { ComponentChild, createRef } from "preact";

import { Button } from "../components/ui/framework/Button.js";
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
import { Grid } from "../components/ui/framework/Grid.js";
import { GridCell } from "../components/ui/framework/GridCell.js";
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

        lightThemes.forEach((themeName: string) => {
            themeItems.push({
                label: themeName,
                onClick: () => {
                    document.documentElement.setAttribute("data-theme", themeName);
                    currentSettings.theme = themeName;
                    this.setState({ currentSettings });
                },
            });
        });
        themeItems.push({ label: "──────────" }); // Separator
        darkThemes.forEach((themeName: string) => {
            themeItems.push({
                label: themeName,
                onClick: () => {
                    document.documentElement.setAttribute("data-theme", themeName);
                    currentSettings.theme = themeName;
                    this.setState({ currentSettings });
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
                <Grid columns={["auto", "1fr"]} id="settingsGrid" columnGap={16}>
                    <GridCell className="settingName">
                        <p className="py-4">Select Color Theme</p>
                    </GridCell>
                    <GridCell className="settingValue">
                        <Dropdown
                            caption={`Current Theme: ${currentTheme}`}
                            items={themeItems}
                            selectedItem={currentTheme}
                        />
                    </GridCell>
                    <GridCell className="settingName">
                        <p className="py-4">Track Viewer Zoom</p>
                    </GridCell>
                    <GridCell className="settingValue">
                        <Label caption={`${currentViewerZoom}%`} style={{ marginRight: "8px" }} />
                        <Button
                            className="zoomButton"
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
                            className="zoomButton"
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
                            className="resetButton"
                            onClick={() => {
                                currentSettings.viewSettings ??= {};
                                currentSettings.viewSettings.arrangementViewSettings ??= {};
                                currentSettings.viewSettings.arrangementViewSettings.zoomLevel = 100;
                                this.setState({ currentSettings });
                            }}
                        />
                    </GridCell>
                </Grid>

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
            // Reset the theme to the original value if the user cancelled the dialog.
            document.documentElement.setAttribute("data-theme", previousSettings.theme ?? "Light+");

            const restoredSettings = JSON.parse(JSON.stringify(previousSettings)) as IUISettings;
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
