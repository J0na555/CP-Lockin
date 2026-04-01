/**
 * Loads all submissions from browser.storage.local and converts them into
 * a flat map of daily problem counts per platform.
 *
 * LeetCode counts come from the submissionCalendar storage key (full year,
 * accurate counts). Codeforces counts come from the individual submissions
 * storage key.
 *
 * Depends on: STORAGE_KEYS and PLATFORMS from src/config/defaults.js
 *
 * @returns {Promise<Object.<string, { leetcode: number, codeforces: number }>>}
 *   Keys are "YYYY-MM-DD" date strings; values are solve counts.
 */
async function getDailyActivity() {
  const [submissionsResult, calendarResult] = await Promise.all([
    browser.storage.local.get(STORAGE_KEYS.SUBMISSIONS),
    browser.storage.local.get(STORAGE_KEYS.LEETCODE_CALENDAR),
  ]);

  const rawSubmissions = submissionsResult[STORAGE_KEYS.SUBMISSIONS] ?? {};
  const lcCalendar = calendarResult[STORAGE_KEYS.LEETCODE_CALENDAR] ?? {};

  const daily = {};

  // Pass 1: seed from individual submission objects (both platforms).
  // This preserves legacy LeetCode objects from before the calendar migration
  // and provides the baseline Codeforces counts used permanently.
  for (const [dateKey, bucket] of Object.entries(rawSubmissions)) {
    if (!bucket || typeof bucket !== "object") continue;

    const codeforces = Array.isArray(bucket[PLATFORMS.CODEFORCES])
      ? bucket[PLATFORMS.CODEFORCES].length
      : 0;
    const leetcodeLegacy = Array.isArray(bucket[PLATFORMS.LEETCODE])
      ? bucket[PLATFORMS.LEETCODE].length
      : 0;

    if (codeforces > 0 || leetcodeLegacy > 0) {
      daily[dateKey] = { leetcode: leetcodeLegacy, codeforces };
    }
  }

  // Pass 2: calendar counts override LeetCode for every date they cover.
  // Once the first calendar sync has run this supersedes all legacy objects.
  for (const [dateKey, count] of Object.entries(lcCalendar)) {
    if (count > 0) {
      if (!daily[dateKey]) daily[dateKey] = { leetcode: 0, codeforces: 0 };
      daily[dateKey].leetcode = count;
    }
  }

  return daily;
}

/**
 * Returns the latest sync attempt and any errors recorded for it.
 *
 * @returns {Promise<{ lastAttempt: number, errors: string[] }>}
 */
async function getDashboardSyncStatus() {
  const result = await browser.storage.local.get(STORAGE_KEYS.SYNC_STATUS);
  const status = result[STORAGE_KEYS.SYNC_STATUS] ?? {};
  return {
    lastAttempt: Number(status.lastAttempt) || 0,
    errors: Array.isArray(status.errors) ? status.errors : [],
  };
}
