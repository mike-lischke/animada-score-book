/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { existsSync, readdirSync } from "node:fs";
import { type IncomingMessage } from "node:http";

import { Auth } from "./Auth.js";
import { isMailConfigured, mailImagesPath } from "./config.js";
import { ConfirmationReason, Mailer } from "./Mailer.js";
import { type RequestContext } from "./RequestContext.js";

/** An account that was asked for but whose confirmation link has not been opened yet. */
export interface IPendingConfirmation {
    email: string;
    purpose: ConfirmationReason;

    /** The already hashed password, for the purposes that create the account. */
    passwordHash?: string;
    displayName?: string;

    /** The group a fresh installation starts with. */
    groupName?: string;

    /** Who created the account, for the mail that announces an account somebody else created. */
    invitedBy?: string;
}

/**
 * The confirmation mails of this installation. Every account needs one: a registration leaves no account behind
 * until its link is opened, and an account an administrator created stays unusable until then.
 */
export class EmailConfirmation {
    /** The brand logo every mail carries, relative to the origin of the confirmation link. */
    private static readonly logoFile = "logo.png";

    /**
     * @param ctx The request context, which holds the database and the configuration.
     *
     * @returns Whether this installation can confirm addresses at all.
     */
    public static isAvailable(ctx: RequestContext): boolean {
        return isMailConfigured(ctx.config.mail);
    }

    /**
     * Stores a pending confirmation and mails its link. A previous pending confirmation for the same address is
     * replaced, so only the newest link works.
     *
     * @param ctx The request context, which holds the database and the configuration.
     * @param req The request that asked for the confirmation, whose origin the link has to lead back to.
     * @param pending The account data the confirmation creates.
     *
     * @returns Whether the mail server accepted the message.
     */
    public static async request(ctx: RequestContext, req: IncomingMessage,
        pending: IPendingConfirmation): Promise<boolean> {
        const token = Auth.createEmailVerificationToken();
        const siteOrigin = EmailConfirmation.siteOriginOf(ctx, req);

        await ctx.auth.adapter.execute("DELETE FROM email_verifications WHERE email = ?", [pending.email]);
        await ctx.auth.adapter.insertReturningId(
            "INSERT INTO email_verifications" +
            " (email, token_hash, purpose, password_hash, display_name, group_name, site_origin)" +
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                pending.email,
                token.hash,
                pending.purpose,
                pending.passwordHash ?? null,
                pending.displayName ?? null,
                pending.groupName ?? null,
                siteOrigin,
            ],
        );

        const publicUrl = ctx.config.mail.publicUrl;
        const origin = publicUrl !== undefined && publicUrl !== "" ? publicUrl.replace(/\/+$/, "") : siteOrigin;

        try {
            await Mailer.sendConfirmation(ctx.config.mail, {
                to: pending.email,
                link: `${origin}/api?action=confirmRegistration&token=${token.raw}`,
                reason: pending.purpose,
                validHours: Auth.emailVerificationExpiryHours,
                invitedBy: pending.invitedBy,
                logoUrl: `${origin}/mail/${EmailConfirmation.logoFile}`,
                illustrationUrl: EmailConfirmation.illustrationUrl(origin),
            });

            return true;
        } catch (e) {
            console.error("Confirmation mail could not be sent:", e);
            await ctx.auth.adapter.execute("DELETE FROM email_verifications WHERE email = ?", [pending.email]);

            return false;
        }
    }

    /**
     * @param origin The origin the confirmation link names.
     *
     * @returns A URL of one of the illustrations the package ships, picked at random, or undefined when it ships
     * none. Reading the directory keeps this in step with `npm run generate:mail-assets`.
     */
    private static illustrationUrl(origin: string): string | undefined {
        const directory = mailImagesPath;

        if (!existsSync(directory)) {
            return undefined;
        }

        const illustrations = readdirSync(directory).filter((file) => {
            return file.endsWith(".png") && file !== EmailConfirmation.logoFile;
        });

        if (illustrations.length === 0) {
            return undefined;
        }

        const index = Math.floor(Math.random() * illustrations.length);

        return `${origin}/mail/${illustrations[index]}`;
    }

    /**
     * @param ctx The request context, which holds the configuration.
     * @param req The request that started a confirmation.
     *
     * @returns The origin of the site whose page started it, which is where the confirmation link leads back to.
     */
    private static siteOriginOf(ctx: RequestContext, req: IncomingMessage): string {
        const origin = ctx.getHeader(req, "origin");
        if (origin !== undefined && origin !== "" && origin !== "null") {
            return origin;
        }

        const referer = ctx.getHeader(req, "referer");
        if (referer !== undefined) {
            try {
                return new URL(referer).origin;
            } catch {
                // A malformed referer is no better than none.
            }
        }

        return ctx.getRequestUrl(req).origin;
    }
}
