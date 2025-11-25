/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

const userAgentRegex = /mobile|tablet|android|ipad|iphone/i;

export const isMobile: boolean = userAgentRegex.test(navigator.userAgent);
