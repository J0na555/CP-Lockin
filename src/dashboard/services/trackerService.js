/**
 * Loads all submissions from browser.storage.local and converts them into
 * a flat map of daily problem counts per platform.
 *
 * LeetCode counts come from the submissionCalendar storage key (full year,
 * accurate counts). Codeforces counts come from the individual submissions
 * storage key.
 *
 * Depends on: STORAGE_KEYS, PLATFORMS (defaults), getSettings,
 * getLeetCodeDateCountsForSettings, getLeetCodeCalendarMeta, isLeetCodeUserNotFound (storageService)
 *
 * @returns {Promise<{ daily: Object.<string, { leetcode: number, codeforces: number }>, leetCodeUserNotFound: boolean }>}
 *   Keys are "YYYY-MM-DD" date strings; values are accepted-submission counts.
 */
async function getDailyActivity() {
  const settings = await getSettings();
  const [submissionsResult, lcCounts, meta] = await Promise.all([
    browser.storage.local.get(STORAGE_KEYS.SUBMISSIONS),
    getLeetCodeDateCountsForSettings(settings),
    getLeetCodeCalendarMeta(),
  ]);

  const rawSubmissions = submissionsResult[STORAGE_KEYS.SUBMISSIONS] ?? {};
  const cfH = (settings.codeforcesHandle ?? "").trim();
  const lcH = (settings.leetcodeHandle ?? "").trim();

  const daily = {};

  // Pass 1: seed from individual submission objects (both platforms).
  // This preserves legacy LeetCode objects from before the calendar migration
  // and provides the baseline Codeforces counts used permanently.
  for (const [dateKey, bucket] of Object.entries(rawSubmissions)) {
    if (!bucket || typeof bucket !== "object") continue;

    const cfArr = Array.isArray(bucket[PLATFORMS.CODEFORCES])
      ? bucket[PLATFORMS.CODEFORCES]
      : [];
    const lcArr = Array.isArray(bucket[PLATFORMS.LEETCODE])
      ? bucket[PLATFORMS.LEETCODE]
      : [];
    const codeforces = cfArr.filter((s) => !s?.handle || s.handle === cfH).length;
    const leetcodeLegacy = lcArr.filter((s) => !s?.handle || s.handle === lcH).length;

    if (codeforces > 0 || leetcodeLegacy > 0) {
      daily[dateKey] = { leetcode: leetcodeLegacy, codeforces };
    }
  }

  // Pass 2: calendar counts override LeetCode for every date they cover.
  // Once the first calendar sync has run this supersedes all legacy objects.
  for (const [dateKey, count] of Object.entries(lcCounts)) {
    if (count > 0) {
      if (!daily[dateKey]) daily[dateKey] = { leetcode: 0, codeforces: 0 };
      daily[dateKey].leetcode = count;
    }
  }

  const leetCodeUserNotFound = isLeetCodeUserNotFound(settings, meta);

  return { daily, leetCodeUserNotFound };
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
