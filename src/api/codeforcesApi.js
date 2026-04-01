/**
 * Codeforces API client.
 *
 * Normalized submission shape:
 * {
 *   platform: "codeforces",
 *   problemId: string,     // e.g. "1234A"
 *   problemName: string,
 *   timestamp: number,     // Unix seconds
 * }
 */

const CF_API_BASE = "https://codeforces.com/api";
/** Max submissions per user.status request (Codeforces cap). */
const CF_FULL_SYNC_COUNT = 10000;
/** Page size when syncing incrementally (newest-first; stop at lastSyncTimestamp). */
const CF_INCREMENTAL_CHUNK = 500;

/**
 * @param {object} s  Raw Codeforces submission object
 * @param {string} handle  Codeforces handle this row was fetched for
 * @returns {{ platform: string, problemId: string, problemName: string, timestamp: number, handle: string }}
 */
function normalizeSubmission(s, handle) {
  return {
    platform: PLATFORMS.CODEFORCES,
    problemId: `${s.problem.contestId ?? ""}${s.problem.index}`,
    problemName: s.problem.name,
    timestamp: s.creationTimeSeconds,
    handle,
  };
}

/**
 * @param {string} handle
 * @param {number} from  1-based index
 * @param {number} count
 * @returns {Promise<Array>}
 */
async function fetchUserStatusPage(handle, from, count) {
  const url = `${CF_API_BASE}/user.status?handle=${encodeURIComponent(handle)}&from=${from}&count=${count}`;

  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data.status !== "OK") {
    throw new Error(data.comment ?? "Unknown Codeforces error");
  }

  return Array.isArray(data.result) ? data.result : [];
}

/**
 * Fetches accepted (verdict === "OK") submissions for a Codeforces handle.
 *
 * When lastSyncTimestamp is 0, performs a full sync (single request, up to
 * CF_FULL_SYNC_COUNT). Otherwise fetches pages newest-first and stops when
 * creationTimeSeconds <= lastSyncTimestamp 
 *
 * @param {string} handle
 * @param {number} lastSyncTimestamp  Unix seconds; only submissions strictly newer are returned
 * @returns {Promise<{submissions: Array, error: string|null, maxOkCreationSec: number}>}
 */
async function getCodeforcesSubmissions(handle, lastSyncTimestamp = 0) {
  if (!handle) {
    return { submissions: [], error: null, maxOkCreationSec: 0 };
  }

  try {
    if (lastSyncTimestamp <= 0) {
      const batch = await fetchUserStatusPage(handle, 1, CF_FULL_SYNC_COUNT);
      let maxOkCreationSec = 0;
      const submissions = [];
      for (const s of batch) {
        if (s.verdict !== "OK") continue;
        const t = s.creationTimeSeconds;
        if (t > maxOkCreationSec) maxOkCreationSec = t;
        submissions.push(normalizeSubmission(s, handle));
      }
      return { submissions, error: null, maxOkCreationSec };
    }

    const submissions = [];
    let maxOkCreationSec = 0;
    let from = 1;
    const maxPages = Math.ceil(CF_FULL_SYNC_COUNT / CF_INCREMENTAL_CHUNK) + 2;

    for (let page = 0; page < maxPages; page++) {
      const batch = await fetchUserStatusPage(handle, from, CF_INCREMENTAL_CHUNK);
      if (batch.length === 0) break;

      let reachedOld = false;
      for (const s of batch) {
        const t = s.creationTimeSeconds;
        if (t <= lastSyncTimestamp) {
          reachedOld = true;
          break;
        }
        if (s.verdict === "OK") {
          if (t > maxOkCreationSec) maxOkCreationSec = t;
          submissions.push(normalizeSubmission(s, handle));
        }
      }

      if (reachedOld) break;
      if (batch.length < CF_INCREMENTAL_CHUNK) break;
      from += CF_INCREMENTAL_CHUNK;
    }

    return { submissions, error: null, maxOkCreationSec };
  } catch (err) {
    return { submissions: [], error: err.message, maxOkCreationSec: 0 };
  }
}
