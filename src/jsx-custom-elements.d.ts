/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import "preact";

declare module "preact" {
    namespace JSX {
        interface IntrinsicElements {
            "load-file": JSX.HTMLAttributes<HTMLElement> & {
                src?: string;
                replaceWith?: boolean;
            };
        }
    }
}
