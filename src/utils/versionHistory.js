// Fetching, caching and bookkeeping for browsing the room's save history.
//
// Versions are addressed by offset (0 = current save, 1 = one save back, ...), and
// a few either side of the one on screen are prefetched so stepping through history
// doesn't wait on the lambda each time. The menu bar reads the loaded version's
// metadata and the buffering state from here; blocks.jsx does the actual loading.
import {inSpace} from './AblyHandlers.jsx';
import {getVersionOffset, setVersionOffset} from './versionOffset.js';

export const S3_STORAGE_URL = 'https://0dhyl8bktg.execute-api.us-east-2.amazonaws.com/scratchBlock/s3-storage';

/** How many saves either side of the one on screen to keep warm. */
const PREFETCH_DEPTH = 2;
// Project JSON can run to megabytes, so only the neighbourhood of the current offset is kept.
const MAX_CACHED = (2 * PREFETCH_DEPTH) + 3;
// Offsets count back from the newest save, so a save made after an entry was fetched
// shifts what that offset means. The response's headVersionId catches that whenever
// we hit the network; this TTL bounds how stale an entry can get in between.
const CACHE_TTL_MS = 3 * 60 * 1000;
// Editing resumes from the current save, so it is only reused right after it was
// fetched (e.g. a date jump that landed on it), never from a prefetch.
const CURRENT_TTL_MS = 10 * 1000;
// API Gateway turns a Lambda timeout or crash into a 502, often a one-off (say a cold
// start on a deep history walk), so reads get one more try after this pause.
const RETRY_DELAY_MS = 500;
// How long a failed history step stays reported in the menu bar.
const LOAD_ERROR_MS = 6000;

const cache = new Map(); // offset -> {promise, result, fetchedAt}
let headVersionId = null;
let headSeq = -1;
let requestSeq = 0;
// {offset, foundAt}: like cache entries, it goes stale once someone may have saved since.
let oldest = null;
let currentVersion = null;
let buffering = null;
let loadError = null;
let loadErrorTimeout = null;

const listeners = new Set();
const notify = () => listeners.forEach(listener => listener());

/**
 * @param {function} listener - called whenever the loaded version, the buffering
 *     state or the cache changes.
 * @returns {function} unsubscribe.
 */
export const subscribeVersionHistory = listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

/** @returns {?object} {offset, versionId, lastModified, author} of the version on screen. */
export const getCurrentVersion = () => currentVersion;

/** @returns {?object} {stage: 'searching'|'fetching'|'loading', offset?, at?} while busy. */
export const getBuffering = () => buffering;

/** @returns {?number} the offset of the oldest save, once a response has reported it. */
export const getOldestOffset = () => {
    if (oldest && Date.now() - oldest.foundAt >= CACHE_TTL_MS) {
        oldest = null;
    }
    return oldest ? oldest.offset : null;
};

/** @returns {?string} why the last history step failed, while it is still shown. */
export const getLoadError = () => loadError;

export const setLoadError = message => {
    clearTimeout(loadErrorTimeout);
    loadError = message;
    if (message) {
        loadErrorTimeout = setTimeout(() => setLoadError(null), LOAD_ERROR_MS);
    }
    notify();
};

export const setBuffering = state => {
    buffering = state;
    notify();
};

export const setCurrentVersion = ({payload, offset}) => {
    currentVersion = {
        offset: offset,
        versionId: payload ? payload.versionId : null,
        lastModified: (payload && payload.lastModified) || null,
        author: (payload && payload.author) || null
    };
    notify();
};

/** Drop everything cached, e.g. after a save moved the head and shifted every offset. */
export const invalidateVersionCache = () => {
    cache.clear();
    oldest = null;
    notify();
};

/**
 * Read one s3-storage response into a version payload. A brand-new room (a 404
 * "No versions found" body) and an unreadable object (the lambda substitutes the
 * literal string 'EMT') both come back as null.
 * @param {Response} response - the fetch response to read.
 * @returns {?object} the version payload, or null if there is no version there.
 */
const readVersionResponse = async response => {
    const text = await response.text();
    if (!response.ok && response.status !== 404) {
        const error = new Error(`s3-storage returned ${response.status}: ${text.slice(0, 200)}`);
        error.retryable = response.status >= 500;
        throw error;
    }
    let payload;
    try {
        payload = JSON.parse(text);
    } catch (e) {
        throw new Error(`Unexpected response from s3-storage: ${text}`);
    }
    if (!payload || !payload.versionData || payload.versionData === 'EMT') {
        return null;
    }
    return payload;
};

/**
 * Ask the lambda for one version.
 * @param {object} body - {versionOffset} or {at} (epoch ms).
 * @returns {object} {payload, offset, stale}: offset is the version actually reached,
 *     payload is null only when the room has never been saved, and stale is true when
 *     a newer response has already seen a different head (so the offset is outdated).
 */
const requestVersion = async body => {
    const seq = ++requestSeq;
    let payload;
    for (let attempt = 1; ; attempt++) {
        try {
            const response = await fetch(S3_STORAGE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(Object.assign({key: inSpace}, body))
            });
            payload = await readVersionResponse(response);
            break;
        } catch (error) {
            // fetch() itself rejects with a TypeError when the network drops.
            if (attempt >= 2 || !(error.retryable || error instanceof TypeError)) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
    }
    if (!payload) {
        return {payload: null, offset: 0, stale: false};
    }
    const offset = typeof payload.versionOffset === 'number' ?
        payload.versionOffset :
        (body.versionOffset || 0);

    if (payload.headVersionId && payload.headVersionId !== headVersionId) {
        if (seq < headSeq) {
            return {payload, offset, stale: true};
        }
        // Someone saved since the cache was filled, so every cached offset now
        // points one or more saves too far forward.
        if (headVersionId !== null) {
            cache.clear();
            oldest = null;
        }
        headVersionId = payload.headVersionId;
        headSeq = seq;
    }
    if (payload.isOldest) {
        oldest = {offset, foundAt: Date.now()};
    }
    return {payload, offset, stale: false};
};

const isFresh = (entry, offset) => {
    if (!entry.result) {
        // Still in flight, so it can't be older than a new request would be.
        return true;
    }
    const ttl = offset === 0 ? CURRENT_TTL_MS : CACHE_TTL_MS;
    return Date.now() - entry.fetchedAt < ttl;
};

const evict = () => {
    const center = getVersionOffset();
    while (cache.size > MAX_CACHED) {
        let farthest = null;
        cache.forEach((entry, offset) => {
            if (farthest === null || Math.abs(offset - center) > Math.abs(farthest - center)) {
                farthest = offset;
            }
        });
        cache.delete(farthest);
    }
};

const store = result => {
    if (result.stale || !result.payload) {
        return;
    }
    cache.set(result.offset, {promise: Promise.resolve(result), result, fetchedAt: Date.now()});
    evict();
    notify();
};

const clampOffset = offset => {
    const oldestOffset = getOldestOffset();
    return oldestOffset === null ? offset : Math.min(offset, oldestOffset);
};

const lookup = offset => {
    const entry = cache.get(offset);
    return entry && isFresh(entry, offset) ? entry : null;
};

/**
 * Resolve a version, from the cache when possible. Concurrent calls for the same
 * offset (say a prefetch and then the user stepping onto it) share one request.
 * @param {number} requestedOffset - 0 for the current save, 1 for one save back, etc.
 * @returns {Promise<object>} {payload, offset}, as from requestVersion.
 */
export const getVersion = requestedOffset => {
    const offset = clampOffset(requestedOffset);
    const cached = lookup(offset);
    if (cached) {
        return cached.promise;
    }

    const entry = {promise: null, result: null, fetchedAt: 0};
    entry.promise = requestVersion({versionOffset: offset}).then(
        result => {
            if (cache.get(offset) === entry) {
                cache.delete(offset);
            }
            // Filed under the offset actually reached, which is smaller than the one
            // asked for when the history ran out.
            store(result);
            return result;
        },
        error => {
            if (cache.get(offset) === entry) {
                cache.delete(offset);
            }
            throw error;
        }
    );
    cache.set(offset, entry);
    evict();
    return entry.promise;
};

/**
 * @param {number} offset - the version to check.
 * @returns {boolean} whether getVersion(offset) would resolve without a network wait.
 */
export const isVersionReady = offset => {
    const entry = lookup(clampOffset(offset));
    return Boolean(entry && entry.result);
};

/**
 * @param {number} offset - the version to look up.
 * @returns {?object} the cached payload there, for showing what a step leads to.
 */
export const peekVersion = offset => {
    const entry = lookup(clampOffset(offset));
    return entry && entry.result ? entry.result.payload : null;
};

/**
 * Warm the cache with the saves either side of a version.
 * @param {number} offset - the version on screen.
 */
export const prefetchAround = offset => {
    const neighbours = [];
    for (let distance = 1; distance <= PREFETCH_DEPTH; distance++) {
        neighbours.push(offset + distance, offset - distance);
    }
    const oldestOffset = getOldestOffset();
    // The current save is never served from a prefetch; see CURRENT_TTL_MS.
    neighbours
        .filter(neighbour => neighbour > 0 && (oldestOffset === null || neighbour <= oldestOffset))
        .forEach(neighbour => {
            getVersion(neighbour).catch(error => {
                console.warn(`Prefetching version ${neighbour} back failed`, error);
            });
        });
};

/**
 * Move to whatever version was current at a moment in time.
 * @param {number} at - epoch ms.
 * @returns {Promise<object>} {payload, offset} of the version found.
 */
export const jumpToDate = async at => {
    setBuffering({stage: 'searching', at});
    let result;
    try {
        result = await requestVersion({at});
        if (!result.payload) {
            throw new Error('This room has no saved versions yet.');
        }
        if (!(result.payload.apiVersion >= 2)) {
            // An older lambda ignores `at` and just returns the current save.
            throw new Error('Jumping to a date needs the updated s3-storage lambda deployed.');
        }
    } finally {
        // Cleared before moving the offset: that synchronously starts the load, which
        // sets its own buffering state.
        setBuffering(null);
    }
    store(result);
    setVersionOffset(result.offset);
    return result;
};
