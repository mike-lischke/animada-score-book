/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * Determines how text is rendered. The type corresponds to a specific CSS class.
 */
export enum MessageType {
    Error,
    Warning,
    Info,
    Text,
    Response,
    Success,
    Log,
}
