/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

const userAgentRegex = /mobile|tablet|android|ipad|iphone/i;

const isTouchDevice = navigator.maxTouchPoints > 0;
const isIPadDesktopMode = navigator.platform === "MacIntel" && isTouchDevice;
const isCoarsePointerDevice = typeof window.matchMedia === "function"
    && window.matchMedia("(any-pointer: coarse)").matches;
const isLikelyMobileSizedScreen = Math.min(window.screen.width, window.screen.height) <= 1024;

export const isMobile: boolean = userAgentRegex.test(navigator.userAgent)
    || isIPadDesktopMode
    || (isTouchDevice && isCoarsePointerDevice && isLikelyMobileSizedScreen);

export const demoSongString = "4-4.110.1.1-4.16.01bDGD.11IOwQ.2kBip.3auavauav.5Gm_CKR.63a4oy4.7M43.8Hgm.9SLHS";
export const emptySongString = "4-4.110.1.1-4.16.00.10.20.30.50.60.70.80.90";
