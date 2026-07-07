/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { type IncomingMessage, type ServerResponse } from "node:http";

import { Auth, type ITokenPayload } from "./Auth.js";
import { type IServerConfig } from "./config.js";

interface IRateLimitEntry {
    failures: number;
    blockedUntil: number;
}

export class RequestContext {
    private static rateLimitCleanupInterval: ReturnType<typeof setInterval>;

    /** In-memory rate limit store: key → { failures, blockedUntil }. */
    private static readonly rateLimitMap = new Map<string, IRateLimitEntry>();

    /** Maximum failed attempts before blocking. */
    private static readonly maxFailures = 7;

    /** Block duration in milliseconds (15 minutes). */
    private static readonly blockDuration = 15 * 60 * 1000;

    public constructor(
        public readonly auth: Auth,
        public readonly config: IServerConfig,
    ) { }

    /**
     * Stops the rate-limit cleanup timer and clears the in-memory store.
     * Call during server shutdown to prevent leaks.
     */
    public static destroyRateLimiter(): void {
        clearInterval(RequestContext.rateLimitCleanupInterval);
        RequestContext.rateLimitMap.clear();
    };

    /**
     * Sends a JSON response with the given status code.
     *
     * @param res The HTTP response.
     * @param data The data to serialise as JSON.
     * @param status The HTTP status code (default 200).
     */
    public sendJson(res: ServerResponse, data: unknown, status = 200): void {
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });

        res.end(JSON.stringify(data));
    };

    /**
     * Sends a JSON error response.
     *
     * @param res The HTTP response.
     * @param message The error message.
     * @param status The HTTP status code (default 400).
     */
    public sendError(res: ServerResponse, message: string, status = 400): void {
        this.sendJson(res, { error: message }, status);
    };

    /**
     * Reads and parses the request body as JSON.
     *
     * @param req The incoming HTTP request.
     * @param maxSize Maximum allowed body size in bytes (default 10 MB).
     *
     * @returns The parsed JSON object, or an empty object for an empty body.
     */
    public readJsonBody(req: IncomingMessage, maxSize = 10 * 1024 * 1024): Promise<Record<string, unknown>> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            let totalSize = 0;

            req.on("data", (chunk: Buffer) => {
                totalSize += chunk.length;

                if (totalSize > maxSize) {
                    req.destroy();

                    reject(new Error("Request body too large"));

                    return;
                }

                chunks.push(chunk);
            });
            req.on("end", () => {
                const raw = Buffer.concat(chunks).toString("utf-8");

                if (!raw) {
                    resolve({});

                    return;
                }

                try {
                    resolve(JSON.parse(raw) as Record<string, unknown>);
                } catch {
                    reject(new Error("Invalid JSON body"));
                }
            });
            req.on("error", reject);
        });
    };

    /**
     * Extracts the first value of a request header, or undefined if absent.
     *
     * @param req The incoming HTTP request.
     * @param name The header name (lowercase).
     *
     * @returns The header value or undefined.
     */
    public getHeader(req: IncomingMessage, name: string): string | undefined {
        const value = req.headers[name];

        return Array.isArray(value) ? value[0] : value;
    };

    /**
     * Returns the effective request URL.
     * Only trusts reverse-proxy headers when {@link IServerConfig.trustProxy} is true.
     *
     * @param req The incoming HTTP request.
     *
     * @returns The reconstructed URL.
     */
    public getRequestUrl(req: IncomingMessage): URL {
        const serverHost = this.getHeader(req, "host") ?? "localhost";

        if (this.config.trustProxy) {
            const proto = this.getHeader(req, "x-forwarded-proto") ?? "http";
            const host = this.getHeader(req, "x-forwarded-host") ?? serverHost;

            return new URL(req.url ?? "/", `${proto}://${host}`);
        }

        return new URL(req.url ?? "/", `http://${serverHost}`);
    };

    /**
     * Extracts the Bearer token from the Authorization header.
     *
     * @param req The incoming HTTP request.
     *
     * @returns The token string or undefined.
     */
    public extractToken(req: IncomingMessage): string | undefined {
        const header = this.getHeader(req, "authorization");

        if (!header?.startsWith("Bearer ")) {
            return undefined;
        }

        return header.slice(7);
    };

    /**
     * Extracts the authenticated user from the request, or returns undefined for anonymous.
     *
     * @param req The incoming HTTP request.
     *
     * @returns The token payload or undefined.
     */
    public getAuthUser(req: IncomingMessage): ITokenPayload | undefined {
        const token = this.extractToken(req);

        if (!token) {
            return undefined;
        }

        return Auth.verifyToken(token);
    };

    /**
     * Extracts a cookie value by name from the Cookie header.
     *
     * @param req The incoming HTTP request.
     * @param name The cookie name.
     *
     * @returns The cookie value or undefined.
     */
    public getCookie(req: IncomingMessage, name: string): string | undefined {
        const cookieHeader = this.getHeader(req, "cookie");

        if (!cookieHeader) {
            return undefined;
        }

        for (const part of cookieHeader.split(";")) {
            const [key, ...rest] = part.trim().split("=");
            if (key === name) {
                return rest.join("=");
            }
        }

        return undefined;
    };

    /**
     * Sets the refresh token as an httpOnly cookie on the response.
     *
     * @param res The HTTP response.
     * @param token The refresh token value.
     * @param maxAge The cookie max age in seconds.
     */
    public setRefreshTokenCookie(res: ServerResponse, token: string, maxAge: number): void {
        const cookie = `refreshToken=${token}; HttpOnly; Secure; Path=/; Max-Age=${maxAge}; SameSite=Lax`;

        res.setHeader("Set-Cookie", cookie);
    };

    /**
     * Clears the refresh token cookie.
     *
     * @param res The HTTP response.
     */
    public clearRefreshTokenCookie(res: ServerResponse): void {
        res.setHeader("Set-Cookie", "refreshToken=; HttpOnly; Secure; Path=/; Max-Age=0; SameSite=Lax");
    };

    /**
     * Returns the client IP address.
     * Only trusts x-forwarded-for when {@link IServerConfig.trustProxy} is true.
     *
     * @param req The incoming HTTP request.
     *
     * @returns The client IP or undefined.
     */
    public getClientIp(req: IncomingMessage): string | undefined {
        if (this.config.trustProxy) {
            const forwarded = this.getHeader(req, "x-forwarded-for");

            if (forwarded) {
                return forwarded.split(",")[0].trim() || undefined;
            }
        }

        return req.socket.remoteAddress ?? undefined;
    };

    /**
     * Generates a random hex colour string using the golden-angle distribution
     * for visually pleasing hue spacing.
     *
     * @returns A hex colour string like "#a1b2c3".
     */
    public randomGroupColor(): string {
        const goldenAngle = 137.508;
        const hue = ((Math.random() * 360) + (goldenAngle * Math.random())) % 360;
        const saturation = 45 + (Math.random() * 20);
        const lightness = 40 + (Math.random() * 15);

        const h = hue / 60;
        const c = ((1 - Math.abs((2 * lightness / 100) - 1)) * saturation) / 100;
        const x = c * (1 - Math.abs((h % 2) - 1));
        const m = (lightness / 100) - (c / 2);

        let r: number;
        let g: number;
        let b: number;

        if (h < 1) {
            r = c; g = x; b = 0;
        } else if (h < 2) {
            r = x; g = c; b = 0;
        } else if (h < 3) {
            r = 0; g = c; b = x;
        } else if (h < 4) {
            r = 0; g = x; b = c;
        } else if (h < 5) {
            r = x; g = 0; b = c;
        } else {
            r = c; g = 0; b = x;
        }

        const toHex = (v: number): string => {
            const hex = Math.round((v + m) * 255).toString(16);

            return hex.length === 1 ? "0" + hex : hex;
        };

        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    };

    /**
     * Checks whether a key is currently rate-limited.
     *
     * @param key The rate-limit key (e.g. `ip:username` or `ip:groupName`).
     *
     * @returns True if the request should be blocked (HTTP 429).
     */
    public checkRateLimit(key: string): boolean {
        const now = Date.now();
        const entry = RequestContext.rateLimitMap.get(key);

        if (entry) {
            if (now < entry.blockedUntil) {
                return true;
            }

            if (now >= entry.blockedUntil + RequestContext.blockDuration) {
                RequestContext.rateLimitMap.delete(key);
            }
        }

        return false;
    };

    /**
     * Records a failed attempt for a key. Blocks the key if the threshold is reached.
     *
     * @param key The rate-limit key.
     */
    public recordFailedAttempt(key: string): void {
        const now = Date.now();
        const entry = RequestContext.rateLimitMap.get(key);

        if (entry) {
            entry.failures += 1;

            if (entry.failures >= RequestContext.maxFailures) {
                entry.blockedUntil = now + RequestContext.blockDuration;
            }
        } else {
            RequestContext.rateLimitMap.set(key, { failures: 1, blockedUntil: 0 });
        }
    };

    /**
     * Clears rate-limit state for a key (called on successful login).
     *
     * @param key The rate-limit key.
     */
    public clearRateLimit(key: string): void {
        RequestContext.rateLimitMap.delete(key);
    };

    /**
     * Builds a rate-limit key from client IP and a discriminator (username or group name).
     *
     * @param req           The incoming HTTP request.
     * @param discriminator The username or group name to include in the key.
     *
     * @returns The rate-limit key.
     */
    public rateLimitKey(req: IncomingMessage, discriminator: string): string {
        const ip = this.getClientIp(req) ?? "unknown";

        return `${ip}:${discriminator}`;
    };

    static {
        /** Periodically purge expired entries to prevent unbounded memory growth. */
        RequestContext.rateLimitCleanupInterval = setInterval(() => {
            const now = Date.now();

            for (const [key, entry] of RequestContext.rateLimitMap) {
                if (now >= entry.blockedUntil + RequestContext.blockDuration) {
                    RequestContext.rateLimitMap.delete(key);
                }
            }
        }, 5 * 60 * 1000); // Every 5 minutes.

        /** Allow the runtime to keep the process alive during tests (Node 22+). */
        if (typeof RequestContext.rateLimitCleanupInterval.ref === "function") {
            RequestContext.rateLimitCleanupInterval.unref();
        }
    }
}
