const log = {};

/**
 *
 * @param key
 * @param value
 */
export function set(key:string, value:any) {
    log[key] = value;

    return value;
}

/**
 *
 * @param key
 */
export function get(key:string) {
    return log[key];
}
