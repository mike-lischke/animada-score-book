/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

export interface ITutorialStep {
    title: string;
    description: string;
    targetSelector?: string;

    /** Selectors tried in order when the element of {@link targetSelector} is not rendered. */
    targetFallbacks?: string[];
    markerShape?: "circle" | "rect";
}

/** Index of the Mixer step in {@link tutorialSteps}. */
export const mixerStepIndex = 4;

export const tutorialSteps: ITutorialStep[] = [
    {
        title: "Welcome",
        description: "Animada Score Book helps you create, arrange, and share samba arrangements."
            + " This tutorial walks you through the most important features.",
    },
    {
        title: "Score Library",
        targetSelector: "[data-tutorial=\"score-library\"]",
        markerShape: "circle",
        description: "The Score Library gives you an overview of all your saved arrangements."
            + " Click the library icon to open it."
            + " From here you can load scores, create folders, and import new arrangements.",
    },
    {
        title: "Display Options",
        targetSelector: "[data-tutorial=\"display-options\"]",
        targetFallbacks: [".headerOverflowMenu"],
        markerShape: "circle",
        description: "Click the gear icon to open display options: theme, zoom level, and other settings."
            + " Choose between various light and dark themes."
            + " On a narrow screen the gear lives in the header's more-actions menu.",
    },
    {
        title: "Playback",
        targetSelector: "[data-tutorial=\"playback\"]",
        markerShape: "rect",
        description: "Press the play button to start playback. You can select a range of measures"
            + " to play only that section. Loop, metronome, count-in, and volume sit in the playback bar."
            + " On a narrow screen they move into the bar's menu.",
    },
    {
        title: "Mixer",
        targetSelector: "[data-tutorial=\"mixer\"]",
        markerShape: "rect",
        description: "On the left side you'll find the mixer with volume controls for each track."
            + " Drag the slider left to lower the volume, or right for a focus boost."
            + " The mixer toggle in the bar above the tracks shows and hides it again.",
    },
    {
        title: "Edit Mode",
        targetSelector: "[data-tutorial=\"edit-mode\"]",
        markerShape: "circle",
        description: "Switch to edit mode to change the arrangement."
            + " Selecting notes opens a contextual toolbar with lengths, dots, and subdivisions."
            + " Above each bar, the action strip adds per-bar repeat marks and switches"
            + " between the grid and staff views.",
    },
    {
        title: "Print / PDF",
        targetSelector: "[data-tutorial=\"print\"]",
        targetFallbacks: [".headerOverflowMenu"],
        markerShape: "circle",
        description: "Click the printer icon to open the print dialog. Choose how many bars per line"
            + " and which tracks to include."
            + " You can print the arrangement directly or save it as a PDF."
            + " On a narrow screen it lives in the header's more-actions menu.",
    },
    {
        title: "MP3 Export",
        targetSelector: "[data-tutorial=\"export\"]",
        targetFallbacks: [".headerOverflowMenu"],
        markerShape: "circle",
        description: "Click the Export button to export your arrangement as an MP3 file."
            + " The app renders the full arrangement with all instruments"
            + " and gives you an MP3 file to download."
            + " On a narrow screen it lives in the header's more-actions menu.",
    },
    {
        title: "Footer & Zen Mode",
        targetSelector: "[data-tutorial=\"footer\"]",
        markerShape: "rect",
        description: "The footer shows where you are in the score and offers a navigator for quick jumps."
            + " Zoom, notifications, and Zen mode sit on the right; Zen mode hides everything but the score."
            + " On a narrow screen zoom and release notes move into the footer's menu.",
    },
    {
        title: "You're ready!",
        description: "That's it! You can re-enable the tutorial anytime in Display Options."
            + " Have fun with Animada Score Book!",
    },
];
