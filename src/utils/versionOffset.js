
const rawVersionOffset = new URLSearchParams(window.location.search).get('versionOffset');

const clamp = value => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/** Whether `versionOffset` was passed at all, i.e. whether to surface the UI. */
export const versionOffsetEnabled = rawVersionOffset !== null;

export const initialVersionOffset = clamp(rawVersionOffset);

let currentVersionOffset = initialVersionOffset;
const listeners = new Set();

export const getVersionOffset = () => currentVersionOffset;

/**
 * Move to a different version. Listeners (the menu bar label, and the Blocks
 * container, which reloads the project) are notified only when the value changes.
 * @param {number} offset - version to move to; negative values clamp to 0.
 * @returns {number} the offset now in effect.
 */
export const setVersionOffset = offset => {
    const next = clamp(offset);
    if (next === currentVersionOffset) {
        return currentVersionOffset;
    }
    currentVersionOffset = next;

    // Keep the URL in sync so a refresh, or a link copied out of the address bar,
    // lands on the same version rather than snapping back to the current one.
    const url = new URL(window.location.href);
    url.searchParams.set('versionOffset', String(next));
    window.history.replaceState(null, '', url);

    listeners.forEach(listener => listener(next));
    return next;
};

/**
 * @param {function} listener - called with the new offset whenever it changes.
 * @returns {function} unsubscribe.
 */
export const subscribeVersionOffset = listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
