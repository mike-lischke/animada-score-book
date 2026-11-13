/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { ConfirmationReason, Mailer } from "../../src/server/Mailer.js";

const baseMail = {
    to: "someone@example.com",
    link: "https://scores.example.com/api?action=confirmRegistration&token=abc",
    validHours: 24,
};

describe("Mailer.composeConfirmation", () => {
    it("names the administrator who created the account", () => {
        const message = Mailer.composeConfirmation({
            ...baseMail, reason: ConfirmationReason.Activation, invitedBy: "Maria Souza",
        });

        expect(message.text).toContain("Maria Souza created an Animada Score Book account");
        expect(message.html).toContain("Maria Souza created an Animada Score Book account");
    });

    it("falls back to an unnamed administrator when the creator is unknown", () => {
        const message = Mailer.composeConfirmation({
            ...baseMail, reason: ConfirmationReason.Activation,
        });

        expect(message.text).toContain("An administrator created an Animada Score Book account");
    });

    it("keeps the creator out of the other mails", () => {
        const message = Mailer.composeConfirmation({
            ...baseMail, reason: ConfirmationReason.InitialAdmin, invitedBy: "Maria Souza",
        });

        expect(message.text).not.toContain("Maria Souza");
        expect(message.html).not.toContain("Maria Souza");
    });

    it("places the illustration it names beside the text", () => {
        const message = Mailer.composeConfirmation({
            ...baseMail,
            reason: ConfirmationReason.Registration,
            illustrationUrl: "https://scores.example.com/mail/banjo-player.png",
        });

        expect(message.html).toContain("src=\"https://scores.example.com/mail/banjo-player.png\"");
        expect(message.text).not.toContain("banjo-player");
    });

    it("leaves the illustration out when the mail names none", () => {
        const message = Mailer.composeConfirmation({ ...baseMail, reason: ConfirmationReason.Registration });

        expect(message.html).not.toContain("<img");
    });

    it("escapes the markup-significant characters of the link", () => {
        const message = Mailer.composeConfirmation({
            ...baseMail, reason: ConfirmationReason.Registration, link: "https://example.com/?a=1&b=2",
        });

        expect(message.html).toContain("https://example.com/?a=1&amp;b=2");
        expect(message.text).toContain("https://example.com/?a=1&b=2");
    });
});
