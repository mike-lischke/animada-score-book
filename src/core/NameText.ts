/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/**
 * How the name of a tag or a score is stored and compared.
 *
 * The comparison has to agree with the database, whose name columns are collated as `utf8mb4_unicode_ci`: there, case
 * and accents do not count, so "Café", "Cafe" and "CAFE" are the same name and a unique index rejects the second one.
 * A collator with base sensitivity reaches the same verdict, which keeps the client and the column from disagreeing
 * about whether a name is already taken.
 */
export class NameText {
    /** A high surrogate followed by a low surrogate: one code point that occupies two UTF-16 units. */
    private static readonly surrogatePairs = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;

    /** Compares names the way the database column does: case and accents do not count. */
    private static readonly collator = new Intl.Collator(undefined, { sensitivity: "base" });

    /**
     * @param value The name as the user typed it.
     *
     * @returns The name as it is stored: trimmed and in the composed Unicode form, so the same letters typed on two
     * systems run through the same code points.
     */
    public static normalize(value: string): string {
        return value.normalize("NFC").trim();
    }

    /**
     * @param value The name to check.
     *
     * @returns Whether the name is valid Unicode. A lone surrogate passes a length check but cannot be encoded as
     * UTF-8; the driver would send U+FFFD instead and the name would come back different from what was typed.
     */
    public static isWellFormed(value: string): boolean {
        return value.isWellFormed();
    }

    /**
     * @param value The name to measure.
     *
     * @returns How many code points the name holds, which is what a `VARCHAR` column counts under utf8mb4.
     * `String#length` does not do: it counts UTF-16 units, so a character outside the basic plane, an emoji or a
     * musical symbol for example, would count twice and would be cut in half by a limit applied on that number.
     */
    public static codePointCount(value: string): number {
        const pairs = value.match(NameText.surrogatePairs);

        return value.length - (pairs?.length ?? 0);
    }

    /**
     * @param left The first name.
     * @param right The second name.
     *
     * @returns Whether both names are the same name. Case and accents do not count, as in the database.
     */
    public static equals(left: string, right: string): boolean {
        return NameText.collator.compare(left, right) === 0;
    }

    /**
     * @param left The first name.
     * @param right The second name.
     *
     * @returns The comparison result, ready for `Array#sort`.
     */
    public static compare(left: string, right: string): number {
        return NameText.collator.compare(left, right);
    }
}
