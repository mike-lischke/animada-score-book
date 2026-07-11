/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

export interface ITutorialStep {
    title: string;
    description: string;
    targetSelector?: string;
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
        markerShape: "circle",
        description: "Click the gear icon to open display options: theme, zoom level, and other settings."
            + " Choose between various light and dark themes.",
    },
    {
        title: "Playback",
        targetSelector: "[data-tutorial=\"playback\"]",
        markerShape: "rect",
        description: "Press the play button to start playback. You can select a range of measures"
            + " to play only that section. Loop, count-in, and metronome controls"
            + " are always visible in the playback bar.",
    },
    {
        title: "Mixer",
        targetSelector: "[data-tutorial=\"mixer\"]",
        markerShape: "rect",
        description: "On the left side you'll find the mixer with volume controls for each track."
            + " Drag the slider left to lower the volume, or right for a focus boost."
            + " This lets you set the perfect balance for your ensemble.",
    },
    {
        title: "Print / PDF",
        targetSelector: "[data-tutorial=\"print\"]",
        markerShape: "circle",
        description: "Click the PDF icon to open the print dialog. Choose how many bars per line"
            + " and which tracks to include."
            + " You can print the arrangement directly or save it as a PDF.",
    },
    {
        title: "MP3 Export",
        targetSelector: "#recordButton",
        markerShape: "circle",
        description: "Click the record button to export your arrangement as an MP3 file."
            + " The app renders the full arrangement with all instruments"
            + " and gives you an MP3 file to download.",
    },
    {
        title: "You're ready!",
        description: "That's it! You can re-enable the tutorial anytime in Display Options."
            + " Have fun with Animada Score Book!",
    },
];
