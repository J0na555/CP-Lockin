/**
 * Loads all submissions from browser.storage.local and converts them into
 * a flat map of daily problem counts per platform.
 *
 * Depends on: STORAGE_KEYS and PLATFORMS from src/config/defaults.js
 *
 * @returns {Promise<Object.<string, { leetcode: number, codeforces: number }>>}
 *   Keys are "YYYY-MM-DD" date strings; values are solve counts.
 */
async function getDailyActivity() {
  const result = await browser.storage.local.get(STORAGE_KEYS.SUBMISSIONS);
  const raw = result[STORAGE_KEYS.SUBMISSIONS] ?? {};
  const daily = {};

  for (const [dateKey, bucket] of Object.entries(raw)) {
    if (!bucket || typeof bucket !== "object") continue;

    const codeforces = Array.isArray(bucket[PLATFORMS.CODEFORCES])
      ? bucket[PLATFORMS.CODEFORCES].length
      : 0;
    const leetcode = Array.isArray(bucket[PLATFORMS.LEETCODE])
      ? bucket[PLATFORMS.LEETCODE].length
      : 0;

    if (codeforces > 0 || leetcode > 0) {
      daily[dateKey] = { leetcode, codeforces };
    }
  }

  return daily;
}
