/**
 * Platform factory — single entry point for fetching submissions.
 *
 * To add a new platform (e.g., AtCoder):
 *   1. Create src/api/atcoderApi.js exporting getAtCoderSubmissions(handle).
 *   2. Load that script before service-worker.js in the background scope.
 *   3. Add a case for PLATFORMS.ATCODER below.
 */


/**
 * Fetches accepted submissions for the given platform and handle.
 * Returns normalized submissions grouped by date key ("YYYY-MM-DD").
 *
 * @param {string} platform  One of PLATFORMS.*
 * @param {string} handle
 * @param {{ cfLastSyncSec?: number }} [options]
 * @returns {Promise<{submissionsByDate: Object.<string, Array>, error: string|null, cfMaxOkCreationSec: number}>}
 */
async function fetchSubmissions(platform, handle, options = {}) {
  let result;

  switch (platform) {
    case PLATFORMS.CODEFORCES:
      result = await getCodeforcesSubmissions(handle, options.cfLastSyncSec ?? 0);
      break;

    case PLATFORMS.LEETCODE:
      // LeetCode is synced via the submissionCalendar path directly in
      // service-worker.js (runSync). fetchSubmissions() is not used for it.
      return { submissionsByDate: {}, error: null, cfMaxOkCreationSec: 0 };

    default:
      return { submissionsByDate: {}, error: `Unknown platform: ${platform}`, cfMaxOkCreationSec: 0 };
  }

  if (result.error) {
    return { submissionsByDate: {}, error: result.error, cfMaxOkCreationSec: 0 };
  }

  const submissionsByDate = groupByDate(result.submissions);
  return {
    submissionsByDate,
    error: null,
    cfMaxOkCreationSec: result.maxOkCreationSec ?? 0,
  };
}

/**
 * Groups a flat submission array into a map keyed by "YYYY-MM-DD".
 * @param {Array<{timestamp:number}>} submissions
 * @returns {Object.<string, Array>}
 */
function groupByDate(submissions) {
  const map = {};
  for (const sub of submissions) {
    const key = timestampToDateKey(sub.timestamp);
    if (!map[key]) map[key] = [];
    map[key].push(sub);
  }
  return map;
}
