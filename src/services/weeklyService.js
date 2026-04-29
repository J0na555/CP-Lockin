/**
 * Returns "YYYY-W##" using ISO-8601 week numbering (Mon-start).
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
function getISOWeekKey(date = new Date()) {
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  localDate.setHours(12, 0, 0, 0);

  const isoDay = (localDate.getDay() + 6) % 7; // Mon=0..Sun=6
  localDate.setDate(localDate.getDate() + 3 - isoDay);
  const isoYear = localDate.getFullYear();

  const firstThursday = new Date(isoYear, 0, 4);
  firstThursday.setHours(12, 0, 0, 0);
  const firstIsoDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() + 3 - firstIsoDay);

  const diffDays = Math.floor((localDate - firstThursday) / 86400000);
  const isoWeek = 1 + Math.floor(diffDays / 7);
  return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

/**
 * Returns the previous ISO week key for the provided date context.
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
function getPreviousISOWeekKey(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - 7);
  return getISOWeekKey(d);
}

/**
 * Returns date keys from Monday to today (inclusive) for the current week.
 * @param {Date} [date=new Date()]
 * @returns {string[]}
 */
function getCurrentWeekDateKeys(date = new Date()) {
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = today.getDay(); // 0=Sun, 1=Mon
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);

  const keys = [];
  const cursor = new Date(monday);
  while (cursor <= today) {
    keys.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/**
 * Computes current-week accepted-submission counts from submission buckets.
 * Only inspects current week days; does not rebuild historical weeks.
 *
 * @param {Object.<string, Object.<string, Array>>} submissionsByDate
 * @param {Date} [date=new Date()]
 * @returns {{ lc: number, cf: number, total: number }}
 */
function getCurrentWeekStats(submissionsByDate, date = new Date()) {
  const weekKeys = getCurrentWeekDateKeys(date);
  let lc = 0;
  let cf = 0;

  for (const dateKey of weekKeys) {
    const bucket = submissionsByDate[dateKey] ?? {};
    lc += (bucket[PLATFORMS.LEETCODE] ?? []).length;
    cf += (bucket[PLATFORMS.CODEFORCES] ?? []).length;
  }

  return { lc, cf, total: lc + cf };
}

/**
 * Reads all persisted weekly snapshots.
 * @returns {Promise<Object.<string, {lc:number, cf:number, total:number}>>}
 */
async function getWeeklyStats() {
  const result = await browser.storage.local.get(STORAGE_KEYS.WEEKLY_STATS);
  const stats = result[STORAGE_KEYS.WEEKLY_STATS];
  return stats && typeof stats === "object" ? stats : {};
}

/**
 * Updates only the current ISO week snapshot in storage.
 * Previous weeks remain untouched.
 *
 * @param {Object.<string, Object.<string, Array>>} submissionsByDate
 * @returns {Promise<{ currentWeekKey: string, weeklyStats: Object, weekChanged: boolean }>}
 */
async function updateWeeklyStats(submissionsByDate) {
  const currentWeekKey = getISOWeekKey(new Date());
  const currentWeekStats = getCurrentWeekStats(submissionsByDate);

  const result = await browser.storage.local.get([
    STORAGE_KEYS.WEEKLY_STATS,
    STORAGE_KEYS.LAST_WEEK_KEY,
  ]);
  const storedWeeklyStats = result[STORAGE_KEYS.WEEKLY_STATS];
  const weeklyStats =
    storedWeeklyStats && typeof storedWeeklyStats === "object"
      ? { ...storedWeeklyStats }
      : {};
  const lastWeekKey =
    typeof result[STORAGE_KEYS.LAST_WEEK_KEY] === "string"
      ? result[STORAGE_KEYS.LAST_WEEK_KEY]
      : "";

  const weekChanged = Boolean(lastWeekKey) && lastWeekKey !== currentWeekKey;
  weeklyStats[currentWeekKey] = currentWeekStats;

  await browser.storage.local.set({
    [STORAGE_KEYS.WEEKLY_STATS]: weeklyStats,
    [STORAGE_KEYS.LAST_WEEK_KEY]: currentWeekKey,
  });

  return { currentWeekKey, weeklyStats, weekChanged };
}
