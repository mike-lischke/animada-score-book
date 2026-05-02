/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { IUISettings } from "../core/AppStorage.js";

export type SimpleCallback = (_: unknown) => Promise<boolean>;

/** A generic type to extract the (single) callback parameter type from the callback map. */
export type IRequisitionCallbackValues<K extends keyof IRequestTypeMap> = Parameters<IRequestTypeMap[K]>[0];

/** A map of request types to their corresponding callback signatures. A callback must only have a single parameter. */
export interface IRequestTypeMap {
    "settingsChanged": (settings: IUISettings) => Promise<boolean>;
    "playRangeChanged": (range?: { from: number; to: number; }) => Promise<boolean>;
    "trackViewModeToggled": (mode: "grid" | "staff") => Promise<boolean>;
}

type CallbackType = IRequestTypeMap[keyof IRequestTypeMap];

/** A central hub for managing requisitions/events/notifications. */
class Requisitions {
    /** A list of callbacks associated with a specific request. */
    private registry = new Map<keyof IRequestTypeMap, CallbackType[]>();

    /**
     * Registers a callback with a given request type for later execution.
     *
     * @param requestType The request type for which to call the given callback. Must not be empty.
     * @param callback The callback to trigger when request with the given id is to be executed.
     */
    public register = <K extends keyof IRequestTypeMap>(requestType: K, callback: IRequestTypeMap[K]): void => {
        if (!this.registry.has(requestType)) {
            this.registry.set(requestType, [callback]);
        } else {
            const list = this.registry.get(requestType)!;

            // Add only if not already there.
            const index = list.findIndex((entry) => {
                return entry === callback;
            });

            if (index === -1) {
                // Push to the head to make later registrations get notifications sooner than earlier registrations.
                // Usually, the later a handler is registered, the more specialized it is.
                list.unshift(callback);
            }
        }
    };

    /**
     * Removes one or more callbacks from the request registry.
     *
     * - With no request type and no callback the entire registry is cleared.
     * - If no callback is given, all callbacks for the given request type are removed.
     * - Otherwise all occurrences of the callback for the given request type are removed.
     *
     * @param requestType If specified then remove only callbacks for that specific type.
     * @param callback If specified remove all registered entries with the specific callback (filtered by requestType).
     */
    public unregister = <K extends keyof IRequestTypeMap>(requestType?: K, callback?: IRequestTypeMap[K]): void => {
        if (!requestType) {
            this.registry.clear();

            return;
        }

        const list = this.registry.get(requestType);
        if (list) {
            if (callback === undefined) {
                this.registry.delete(requestType);

                return;
            }

            const newList = list.filter((candidate) => {
                return candidate !== callback;
            });

            if (newList.length > 0) {
                this.registry.set(requestType, newList);
            } else {
                this.registry.delete(requestType);
            }
        }
    };

    /**
     * Returns the number of registrations for a given requisition. Useful mostly for tests.
     *
     * @param requestType The type for which to return the count.
     *
     * @returns The number registered callbacks.
     */
    public registrations = <K extends keyof IRequestTypeMap>(requestType: K): number => {
        const list = this.registry.get(requestType);

        return list?.length ?? 0;
    };

    /**
     * Execute a list of registered callbacks for a request.
     *
     * @param requestType The request type for which to execute the registered callbacks.
     * @param parameter The value required for the callbacks.
     *
     * @returns A promise which is resolved when all callbacks are resolved.
     */
    public execute = async <K extends keyof IRequestTypeMap>(requestType: K,
        parameter: IRequisitionCallbackValues<K>): Promise<boolean> => {
        const list = this.registry.get(requestType);
        if (list) {
            const promises: Array<Promise<boolean>> = [];
            list.forEach((callback) => {
                // See here why we have to cast:
                // https://stackoverflow.com/questions/55933800/typescript-unexpected-intersection.
                // And we need to cast to `never` because simple types intersect to `never`.
                promises.push(callback(parameter as never));
            });

            const results = await Promise.allSettled(promises);
            let handled = false;

            results.forEach((value) => {
                if (value.status === "rejected") {
                    console.error(`Requisition callback for request type ${requestType} failed with error:`,
                        value.reason);

                    return;
                }

                handled ||= value.value;
            });

            // Return a true value for the promise if at least one callback handled the request
            // (by returning true).
            return Promise.resolve(handled);
        }

        return Promise.resolve(false);
    };
}

export const requisitions = new Requisitions();
