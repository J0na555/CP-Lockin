const DEFAULTS = {
  weeklyGoal: 25,
  dailyMinGoal: 1,
  requireBothSitesForStreak: false,
  syncIntervalMinutes: 30,
  codeforcesHandle: "",
  leetcodeHandle: "",
};

const FETCH_TIMEOUT_MS = 10000;

/**
 * Wraps fetch() with an abort timer so network calls fail fast instead of
 * hanging indefinitely.
 *
 *
 * @param {RequestInfo|URL} input
 * @param {RequestInit} [init]
 * @param {number} [timeoutMs=FETCH_TIMEOUT_MS]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(input, init = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  let didTimeout = false;

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  function abortFromUpstream() {
    controller.abort();
  }

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      upstreamSignal.addEventListener("abort", abortFromUpstream, { once: true });
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (didTimeout) {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
}

const PLATFORMS = {
  CODEFORCES: "codeforces",
  LEETCODE: "leetcode",
};

const STORAGE_KEYS = {
  SETTINGS: "settings",
  SUBMISSIONS: "submissions",
  // Buffered Codeforces submissions scraped from submissions pages, keyed by handle.
  // Shape: { [handle: string]: Array<object> }
  CF_DOM_SUBMISSIONS: "cfDomSubmissions",
  /** Codeforces incremental sync: { handle: string, lastSyncTimestamp: number } ). */
  CF_INCREMENTAL_SYNC: "cfIncrementalSync",
  LAST_SYNC: "lastSync",
  SYNC_STATUS: "syncStatus",
  // Per-day LeetCode submission counts sourced from submissionCalendar.
  // Shape: { [dateKey: "YYYY-MM-DD"]: number }
  LEETCODE_CALENDAR: "leetcodeCalendar",
  /** { handle: string, userFound: boolean } — last sync outcome for the calendar blob. */
  LEETCODE_CALENDAR_META: "leetcodeCalendarMeta",
  /** Archived calendars when user keeps data after a handle change. Shape: { [handle]: { [dateKey]: number } } */
  LEETCODE_CALENDAR_ARCHIVE: "leetcodeCalendarArchive",
  // Weekly solved snapshots keyed by ISO week (YYYY-W##).
  // Shape: { [weekKey: "YYYY-W##"]: { lc: number, cf: number, total: number } }
  WEEKLY_STATS: "weeklyStats",
  // Tracks which ISO week was last updated by sync.
  LAST_WEEK_KEY: "lastWeekKey",
};

const SYNC_ALARM_NAME = "cp-lockin-sync";
