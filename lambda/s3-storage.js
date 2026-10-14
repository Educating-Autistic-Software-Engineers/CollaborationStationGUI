
const AWS = require("aws-sdk");
AWS.config.update({ region: "us-east-2" });
const s3 = new AWS.S3();

const BUCKET = "scratchblocks";
const DELIMITER = "~|@^|@|~";
const MAX_VERSION_PAGES = 10; // safety stop for the version walk (~10k versions at 1000/page)

exports.handler = async function (event) {
    try {
        if (event.httpMethod !== "POST" || typeof event.body !== "string") {
            return buildResponse(404, { message: "Not Found" });
        }

        if (event.body.includes(DELIMITER)) {
            const cut = event.body.indexOf(DELIMITER);
            const key = event.body.slice(0, cut);
            const projectJson = event.body.slice(cut + DELIMITER.length);
            // The saver's name rides on the query string rather than in the body so an
            // older lambda (which ignores it) still stores the project untouched.
            const params = event.queryStringParameters || {};
            return await postData(key, projectJson, params.author);
        }

        return await getVersion(event.body);
    } catch (err) {
        console.error("Unhandled error:", err);
        return buildResponse(500, { message: err.message });
    }
};

function buildResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    };
}

/**
 * Page through the versions of "<key>.json" newest-first, grouping each run of
 * consecutive equal-size versions into one state whose newest member stands for
 * it. `visit(version, stateIndex, startsState)` is called for every version and
 * returns true to stop the walk.
 *
 * Stopping as soon as the caller has what it needs, instead of listing the entire
 * history, keeps this well under the Lambda timeout even for a huge version log.
 *
 * @returns {Promise<boolean>} true when the end of the history was reached.
 */
async function walkStates(key, visit) {
    const objectKey = key + ".json";
    let prevSize;
    let index = -1;
    let keyMarker;
    let versionIdMarker;

    for (let pages = 0; pages < MAX_VERSION_PAGES; pages++) {
        const page = await s3
            .listObjectVersions({
                Bucket: BUCKET,
                Prefix: objectKey,
                // S3's maximum. Each page is a round trip, and a deep walk through a
                // long run of autosaves can otherwise outlast the Lambda timeout.
                MaxKeys: 1000,
                KeyMarker: keyMarker,
                VersionIdMarker: versionIdMarker,
            })
            .promise();

        for (const v of page.Versions || []) {
            // Prefix is a starts-with match; keep only the exact key so a sibling
            // like "<key>.json.bak" can't slip into the history. S3 lists a page
            // newest-first, so a running-size compare dedupes correctly, and it
            // carries across page boundaries because prevSize outlives the loop.
            if (v.Key !== objectKey) continue;
            const startsState = v.Size !== prevSize;
            if (startsState) {
                index++;
                prevSize = v.Size;
            }
            if (visit(v, index, startsState)) return false;
        }

        if (!page.IsTruncated) return true;
        keyMarker = page.NextKeyMarker;
        versionIdMarker = page.NextVersionIdMarker;
    }

    return false;
}

/**
 * Load one state of the project. The body picks it either by `versionOffset`
 * (distinct saves back from the current one) or by `at` (epoch ms: the state that
 * was current at that moment). Either way the response reports the offset reached,
 * so clients can step from there with versionOffset.
 */
async function getVersion(rawBody) {
    console.log("Load request:", rawBody);

    const req = JSON.parse(rawBody);
    const key = req.key;

    const at = req.at === undefined || req.at === null ? null : Number(req.at);
    if (at !== null && !Number.isFinite(at)) {
        return buildResponse(400, { message: "`at` must be a timestamp in milliseconds" });
    }

    // Prefer versionOffset. Fall back to the old `vid` flag for older callers:
    // vid === 1 meant "one back", anything else meant "current".
    let requestedOffset = req.versionOffset;
    if (requestedOffset === undefined || requestedOffset === null) {
        requestedOffset = req.vid === 1 ? 1 : 0;
    }
    requestedOffset = Math.max(0, parseInt(requestedOffset, 10) || 0);

    const heads = []; // the newest version of each state, newest state first
    let target = null;
    const exhausted = await walkStates(key, (v, index, startsState) => {
        if (startsState) {
            // Seeing the start of the state after the target proves older history
            // exists, which is all the walk needs past the target.
            if (target !== null) return true;
            heads.push(v);
        }
        if (target === null &&
            (at === null ? index === requestedOffset : v.LastModified.getTime() <= at)) {
            target = index;
        }
        return false;
    });

    if (heads.length === 0) {
        return buildResponse(404, { message: "No versions found" });
    }

    // Asked for more history than exists (or a date before the first save): clamp
    // to the oldest state the walk reached.
    const reachedOffset = target === null ? heads.length - 1 : target;
    const selected = heads[reachedOffset];
    const body = await getBody(key, selected.VersionId);

    return buildResponse(200, {
        // Lets clients tell this lambda apart from one without `at`/metadata support.
        apiVersion: 2,
        versionId: selected.VersionId,
        requestedOffset: requestedOffset,
        requestedAt: at,
        // The offset actually reached: smaller than requested when the caller asked
        // for more history than exists. Clients pin their UI to this.
        versionOffset: reachedOffset,
        isOldest: exhausted && reachedOffset === heads.length - 1,
        // The newest save. Offsets count back from it, so clients drop offset-keyed
        // caches when it changes.
        headVersionId: heads[0].VersionId,
        lastModified: selected.LastModified.toISOString(),
        author: body.author,
        distinctVersionsSeen: heads.length,
        // Retained so the previous marker-walking client still parses a response.
        keyMarker: key + ".json",
        versionIdMarker: selected.VersionId,
        versionData: body.versionData,
    });
}

/**
 * @returns {Promise<{versionData: string, author: ?string}>} versionData is "EMT"
 *     when the object can't be read; author is null for saves made before it was
 *     recorded.
 */
async function getBody(key, versionId) {
    try {
        const data = await s3
            .getObject({ Bucket: BUCKET, Key: key + ".json", VersionId: versionId })
            .promise();
        return {
            versionData: data.Body.toString("utf-8"),
            author: decodeAuthor((data.Metadata || {}).author),
        };
    } catch (err) {
        console.error("getObject failed:", err);
        return { versionData: "EMT", author: null };
    }
}

// S3 user metadata travels as HTTP headers, so names are stored percent-encoded to
// keep non-ASCII characters intact.
function encodeAuthor(author) {
    if (typeof author !== "string" || !author.trim()) return null;
    return encodeURIComponent(author.trim().slice(0, 100));
}

function decodeAuthor(stored) {
    if (!stored) return null;
    try {
        return decodeURIComponent(stored);
    } catch (e) {
        return stored;
    }
}

async function newestVersion(key) {
    const objectKey = key + ".json";
    const page = await s3
        .listObjectVersions({ Bucket: BUCKET, Prefix: objectKey, MaxKeys: 20 })
        .promise();
    return (page.Versions || []).find(v => v.Key === objectKey) || null;
}

async function postData(key, projectJson, author) {
    // The client double-encodes: vm.toJSON() already returns a string, then the
    // client JSON.stringify()s it again. Peel one layer so what lands in the bucket
    // is a plain project-JSON string, matching every version the previous lambda
    // wrote (it did the same via `JSON.parse(body)` before upload). If the payload
    // isn't JSON at all, store it untouched rather than lose it.
    let body = projectJson;
    try {
        const once = JSON.parse(projectJson);
        body = typeof once === "string" ? once : JSON.stringify(once);
    } catch (e) {
        console.warn("Save payload was not JSON; storing as-is.");
    }

    const size = Buffer.byteLength(body, "utf8");
    const storedAuthor = encodeAuthor(author);
    console.log(`Save request: ${key}.json (${size} bytes) by ${author || "unknown"}`);

    try {
        const current = await newestVersion(key);
        if (current && current.Size === size) {
            console.log("Payload size matches newest version; skipping save.");
            return buildResponse(200, {
                message: "No change detected; save skipped",
                skipped: true,
            });
        }
    } catch (err) {
        // Non-fatal: if the duplicate check breaks, save anyway rather than drop an edit.
        console.warn("Duplicate check failed, saving anyway:", err.message);
    }

    try {
        await s3
            .upload({
                Bucket: BUCKET,
                Key: key + ".json",
                Body: body,
                ContentType: "text/plain",
                Metadata: storedAuthor ? { author: storedAuthor } : {},
            })
            .promise();
        return buildResponse(200, { message: "File uploaded successfully" });
    } catch (err) {
        console.error("Upload failed:", err);
        return buildResponse(500, { message: "Error uploading file" });
    }
}
