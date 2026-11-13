/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { createTransport } from "nodemailer";

import { type IMailConfig } from "./config.js";

/** Why a confirmation link was sent, which decides the wording of the mail. */
export enum ConfirmationReason {
    /** A visitor created an account on the website. */
    Registration = "registration",

    /** The operator finishes a fresh installation. */
    InitialAdmin = "initialAdmin",

    /** An administrator created an account for somebody else. */
    Activation = "activation",
}

/** One confirmation mail. */
export interface IConfirmationMail {
    /** The address the account belongs to. */
    to: string;

    /** The link that confirms the address when it is opened. */
    link: string;

    /** Why the link was sent. */
    reason: ConfirmationReason;

    /** How long the link stays usable. */
    validHours: number;

    /** Who created the account, for the mail that announces an account somebody else created. */
    invitedBy?: string;

    /** Absolute URL of the logo in the title row. Without it the row carries the wordmark alone. */
    logoUrl?: string;

    /** Absolute URL of the illustration above the mail's end. Without it the mail ends with the note. */
    illustrationUrl?: string;
}

/** A confirmation mail, ready to hand to the mail server. */
export interface IConfirmationMessage {
    subject: string;
    text: string;
    html: string;
}

/** The parts of the mail that differ per reason. */
interface IMailWording {
    subject: string;
    headline: string;
    introduction: string;
}

/**
 * Delivers the mails that confirm a new account. Every account of this installation needs one, so an installation
 * without a mail account cannot create accounts at all.
 */
export class Mailer {
    /**
     * @param mail The configured mail account.
     * @param message The confirmation mail to send.
     *
     * @returns A promise that resolves once the mail server accepted the message.
     */
    public static async sendConfirmation(mail: IMailConfig, message: IConfirmationMail): Promise<void> {
        const transport = createTransport({
            host: mail.host,
            port: mail.port,
            secure: mail.secure,
            auth: mail.user.length > 0 ? { user: mail.user, pass: mail.password } : undefined,
        });

        const { subject, text, html } = Mailer.composeConfirmation(message);

        try {
            await transport.sendMail({
                from: mail.from,
                to: message.to,
                subject,
                text,
                html,
            });
        } finally {
            transport.close();
        }
    }

    /**
     * @param message The confirmation mail.
     *
     * @returns The subject, the plain text body and the HTML body of that mail.
     */
    public static composeConfirmation(message: IConfirmationMail): IConfirmationMessage {
        return {
            subject: Mailer.wording(message).subject,
            text: Mailer.textBody(message),
            html: Mailer.htmlBody(message),
        };
    }

    /**
     * @param value The text to place in the markup.
     *
     * @returns The text with the markup-significant characters replaced.
     */
    public static escapeHtml(value: string): string {
        return value
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;");
    }

    /**
     * @param message The confirmation mail.
     *
     * @returns The subject, headline and opening sentence of the mail.
     */
    private static wording(message: IConfirmationMail): IMailWording {
        switch (message.reason) {
            case ConfirmationReason.InitialAdmin: {
                return {
                    subject: "Finish your Animada Score Book installation",
                    headline: "Finish the installation",
                    introduction: "An administrator account for Animada Score Book is waiting for this address. "
                        + "Open the link below to create it and finish the installation.",
                };
            }

            case ConfirmationReason.Activation: {
                return {
                    subject: "Activate your Animada Score Book account",
                    headline: "Activate your account",
                    introduction: `${Mailer.creatorOf(message)} created an Animada Score Book account for this `
                        + "address. Open the link below to activate it.",
                };
            }

            case ConfirmationReason.Registration: {
                return {
                    subject: "Confirm your Animada Score Book account",
                    headline: "Confirm your account",
                    introduction: "Welcome to Animada Score Book. Open the link below to confirm this address "
                        + "and finish your registration.",
                };
            }
        }
    }

    /**
     * @param message The confirmation mail.
     *
     * @returns The title row of the mail: the logo, where the deployment serves one, next to the wordmark.
     */
    private static brandRow(message: IConfirmationMail): string {
        const logoUrl = message.logoUrl?.trim();
        const logo = logoUrl === undefined || logoUrl === ""
            ? ""
            : `<img src="${Mailer.escapeHtml(logoUrl)}" width="27" height="32" alt="" `
                + "style=\"vertical-align:middle;margin-right:10px;border:0;outline:none;\">";

        return "<p style=\"margin:0 0 18px;padding-bottom:14px;border-bottom:1px solid #e6dfd1;"
            + "font-size:16px;font-weight:600;line-height:32px;\">"
            + `${logo}Animada Score Book</p>`;
    }

    /**
     * @param message The confirmation mail.
     *
     * @returns The headline, the introduction and the button, with the illustration beside them. A table keeps the
     * two columns side by side in every mail client.
     */
    private static contentRow(message: IConfirmationMail): string {
        const { headline, introduction } = Mailer.wording(message);
        const link = Mailer.escapeHtml(message.link);
        const illustrationUrl = message.illustrationUrl?.trim();

        const text = `<h1 style="margin:0 0 12px;font-size:22px;">${Mailer.escapeHtml(headline)}</h1>`
            + `<p style="margin:0 0 16px;line-height:1.5;">${Mailer.escapeHtml(introduction)}</p>`
            + "<p style=\"margin:0;\">"
            + `<a href="${link}" style="display:inline-block;padding:10px 18px;background:#17657f;color:#fff;`
            + "text-decoration:none;border-radius:6px;font-weight:600;\">Confirm address</a></p>";

        const figure = illustrationUrl === undefined || illustrationUrl === ""
            ? ""
            : "<td width=\"112\" style=\"vertical-align:top;padding:0;\">"
                + `<img src="${Mailer.escapeHtml(illustrationUrl)}" width="112" height="112" alt="" `
                + "style=\"display:block;border:0;outline:none;\">"
                + "</td>";

        return "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\" "
            + "style=\"margin:0 0 18px;\"><tr>"
            + `<td style="vertical-align:top;padding:0 12px 0 0;">${text}</td>`
            + figure
            + "</tr></table>";
    }

    /**
     * @param message The confirmation mail.
     *
     * @returns Who created the account, as far as the mail knows it.
     */
    private static creatorOf(message: IConfirmationMail): string {
        const invitedBy = message.invitedBy?.trim();

        return invitedBy !== undefined && invitedBy !== "" ? invitedBy : "An administrator";
    }

    /**
     * @param message The confirmation mail to write.
     *
     * @returns The plain text body.
     */
    private static textBody(message: IConfirmationMail): string {
        const { introduction } = Mailer.wording(message);

        return [
            introduction,
            "",
            message.link,
            "",
            `The link stays valid for ${message.validHours} hours.`,
            "If you did not ask for this account, ignore this mail.",
            "",
            "Animada Score Book",
        ].join("\n");
    }

    /**
     * @param message The confirmation mail to write.
     *
     * @returns The HTML body.
     */
    private static htmlBody(message: IConfirmationMail): string {
        const link = Mailer.escapeHtml(message.link);

        return [
            "<!doctype html>",
            "<html lang=\"en\"><body style=\"margin:0;padding:24px;background:#f4f1ea;"
            + "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1f1d1a;\">",
            "<div style=\"max-width:520px;margin:0 auto;padding:24px;background:#fffdf8;"
            + "border:1px solid #ded7c8;border-radius:8px;\">",
            Mailer.brandRow(message),
            Mailer.contentRow(message),
            `<p style="margin:0 0 8px;line-height:1.5;word-break:break-all;font-size:13px;">`
            + `<a href="${link}" style="color:#3f6d80;">${link}</a></p>`,
            `<p style="margin:0;line-height:1.5;font-size:13px;color:#6b665c;">The link stays valid for `
            + `${message.validHours} hours. If you did not ask for this account, ignore this mail.</p>`,
            "</div>",
            "</body></html>",
        ].join("");
    }
}
