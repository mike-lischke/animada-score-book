/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { themeNames } from "../generated/theme-names.js";

import { Component, ComponentChild, createRef } from "preact";
import { Dialog } from "../components/ui/framework/Dialog.js";
import { Dropdown, type IDropdownItem } from "../components/ui/framework/Dropdown.js";
import { AppStorage, type IUISettings } from "../core/AppStorage.js";
import { Codicon } from "../components/ui/framework/Codicon.js";
import { Icon } from "../components/ui/framework/Icon.js";
import { Container } from "../components/ui/framework/Container.js";
import { ChildAlignment, Orientation } from "../components/ui/framework/ui-types.js";
import { Button } from "../components/ui/framework/Button.js";
import { clampValue } from "../core/utils.js";

export interface ISettingsDialogProperties {
    onSettingsChanged?: (settings: IUISettings) => void;
}

interface ISettingsDialogState {
    /** Settings are they are currently. Might not yet be saved. */
    currentSettings: IUISettings;

    /** Settings as they were before any changes. */
    previousSettings: IUISettings;
}

export class SettingsDialog extends Component<ISettingsDialogProperties, ISettingsDialogState> {
    private dialogRef = createRef<Dialog>();

    public constructor(props: ISettingsDialogProperties) {
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
                <p className="py-4">Here you can change the settings of the application.</p>
                <Dropdown
                    caption={`Current Theme: ${currentTheme}`}
                    items={themeItems}
                    selectedItem={currentTheme}
                />

                <p className="py-4">Change the zoom level of the arrangement viewer.</p>
                <Button
                    round
                    imageOnly
                    className="zoomButton"
                    onClick={() => {
                        const newZoom = clampValue(currentViewerZoom - 10, 50, 150);
                        if (newZoom !== currentViewerZoom) {
                            currentSettings.viewSettings = currentSettings.viewSettings ?? {};
                            currentSettings.viewSettings.arrangementViewSettings ??= {};
                            currentSettings.viewSettings.arrangementViewSettings.zoomLevel = newZoom;
                            this.setState({ currentSettings }, () => {
                                this.temporarySettingsChange();
                            });
                        }
                    }}
                >
                    <Icon src={Codicon.ZoomOut} />
                </Button>

                <Button
                    round
                    imageOnly
                    className="zoomButton"
                    onClick={() => {
                        const newZoom = clampValue(currentViewerZoom + 10, 50, 150);
                        if (newZoom !== currentViewerZoom) {
                            currentSettings.viewSettings = currentSettings.viewSettings ?? {};
                            currentSettings.viewSettings.arrangementViewSettings ??= {};
                            currentSettings.viewSettings.arrangementViewSettings.zoomLevel = newZoom;
                            this.setState({ currentSettings }, () => {
                                this.temporarySettingsChange();
                            });
                        }
                    }}
                >
                    <Icon src={Codicon.ZoomIn} />
                </Button>

                <Button
                    caption="Reset Zoom"
                    className="zoomButton"
                    onClick={() => {
                        currentSettings.viewSettings = currentSettings.viewSettings ?? {};
                        currentSettings.viewSettings.arrangementViewSettings ??= {};
                        currentSettings.viewSettings.arrangementViewSettings.zoomLevel = 100;
                        this.setState({ currentSettings });
                    }}
                >
                    <Icon src={Codicon.ZoomIn} />
                </Button>

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
        const { onSettingsChanged } = this.props;
        const { currentSettings, previousSettings } = this.state;

        if (returnValue === "cancel" || returnValue === "") {
            // Reset the theme to the original value if the user cancelled the dialog.
            document.documentElement.setAttribute("data-theme", previousSettings.theme ?? "Light+");

            const restoredSettings = JSON.parse(JSON.stringify(previousSettings)) as IUISettings;
            this.setState({ currentSettings: restoredSettings });
        } else {
            const newPreviousSettings = JSON.parse(JSON.stringify(currentSettings)) as IUISettings;
            this.setState({ previousSettings: newPreviousSettings });

            AppStorage.saveUISettings(currentSettings);
            onSettingsChanged?.(currentSettings);
        }
    };

    private temporarySettingsChange() {
        const { onSettingsChanged } = this.props;
        const { currentSettings } = this.state;

        onSettingsChanged?.(currentSettings);
    }
}
