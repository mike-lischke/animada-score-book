/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { cleanup, render } from "@testing-library/preact";
import { describe, expect, it, afterEach } from "vitest";

import { PermMatrix } from "../../src/ui/PermMatrix.js";

describe("PermMatrix", () => {
    afterEach(() => {
        cleanup();
    });

    it("renders 3 rows with 2 dots each (6 dots total)", () => {
        const { container } = render(<PermMatrix permBits={492} />);
        const rows = container.querySelectorAll(".permRow");

        expect(rows.length).toBe(3);

        let totalDots = 0;
        rows.forEach((row) => {
            totalDots += row.querySelectorAll(".permDot").length;
        });

        expect(totalDots).toBe(6);
    });

    it("owner rwx shows both dots filled", () => {
        // Owner RWX (7), Group none (0), World none (0) → 7<<6 | 0 = 448.
        const { container } = render(<PermMatrix permBits={448} />);
        const rows = container.querySelectorAll(".permRow");
        const ownerDots = rows[0].querySelectorAll(".permDot");

        expect(ownerDots.length).toBe(2);
        expect(ownerDots[0].classList.contains("filled")).toBe(true); // read
        expect(ownerDots[1].classList.contains("filled")).toBe(true); // write
    });

    it("group r-- shows only read dot filled", () => {
        // Owner none (0), Group R (4), World none (0) → 4<<3 = 32.
        const { container } = render(<PermMatrix permBits={32} />);
        const rows = container.querySelectorAll(".permRow");
        const groupDots = rows[1].querySelectorAll(".permDot");

        expect(groupDots[0].classList.contains("filled")).toBe(true);  // read
        expect(groupDots[1].classList.contains("filled")).toBe(false); // write
    });

    it("world r-- shows only read dot filled", () => {
        // Owner none (0), Group none (0), World R (4) → 4.
        const { container } = render(<PermMatrix permBits={4} />);
        const rows = container.querySelectorAll(".permRow");
        const worldDots = rows[2].querySelectorAll(".permDot");

        expect(worldDots[0].classList.contains("filled")).toBe(true);
        expect(worldDots[1].classList.contains("filled")).toBe(false);
    });

    it("permBits 0 shows all dots empty", () => {
        const { container } = render(<PermMatrix permBits={0} />);
        const dots = container.querySelectorAll(".permDot");

        expect(dots.length).toBe(6);
        dots.forEach((dot) => {
            expect(dot.classList.contains("filled")).toBe(false);
        });
    });

    it("permBits 511 (all rwx) shows all dots filled", () => {
        // 0b111_111_111 = 511.
        const { container } = render(<PermMatrix permBits={511} />);
        const dots = container.querySelectorAll(".permDot");

        dots.forEach((dot) => {
            expect(dot.classList.contains("filled")).toBe(true);
        });
    });
});
