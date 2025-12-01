/*
* Copyright (c) Mike Lischke. All rights reserved.
* Licensed under the MIT License. See License.txt in the project root for license information.
*/

/* eslint-disable prefer-arrow/prefer-arrow-functions, jsdoc/require-jsdoc */

import { useCallback, useContext } from "preact/hooks";

import { AnimadaScoreBookContext } from "../../components/ui/ScoreBookViewer.js";
import type { EditCommand } from "../../Core/types/edit_commands.js";

export type EditFunction = (command: EditCommand) => void;

export function useEditCommand(): EditFunction {
    const scoreBook = useContext(AnimadaScoreBookContext)!;

    return useCallback((command: EditCommand) => {
        scoreBook.edit(command);
    }, []);
}
