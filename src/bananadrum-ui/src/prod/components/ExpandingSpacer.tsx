/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention, jsdoc/require-jsdoc */

import type { JSX } from "preact/jsx-runtime";

export function ExpandingSpacer(): JSX.Element {
    return <div style={{ flexGrow: 1 }} />;
}
