/**
 *
 * @param callback
 * @param time
 */
export function promiseTimeout(callback:Function, time:number) {
    return new Promise<void>(resolve => {
        return setTimeout(() => {
            callback();
            resolve();
        }, time);
    });
}
