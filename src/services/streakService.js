/**
 * Calculates the current and longest streaks.
 *
 * "Current" streak:
 *   - Walk backward from today. If today has no accepted submissions, check yesterday (a
 *     streak can still be active if today's data hasn't been synced yet).
 *   - Stop at the first day with fewer than dailyMinGoal accepted submissions.
 *
 * "Longest" streak:
 *   - Scan all stored dates in ascending order.
 *
 * @param {Object.<string, Object.<string, Array>>} submissionsByDate
 * @param {{dailyMinGoal?:number, requireBothSitesForStreak?:boolean}} [settings]
 * @returns {{ current: number, longest: number }}
 */
function calculateStreak(submissionsByDate, settings = {}) {
  const dailyMinGoal = settings.dailyMinGoal ?? 1;
  const requireBothSitesForStreak = Boolean(settings.requireBothSitesForStreak);
  const today = getTodayKey();

  function countsForDate(dateKey) {
    const bucket = submissionsByDate[dateKey] ?? {};
    const codeforces = (bucket[PLATFORMS.CODEFORCES] ?? []).length;
    const leetcode = (bucket[PLATFORMS.LEETCODE] ?? []).length;
    return { codeforces, leetcode, total: codeforces + leetcode };
  }

  function qualifiesForStreak(dateKey) {
    const counts = countsForDate(dateKey);
    if (counts.total < dailyMinGoal) return false;
    if (!requireBothSitesForStreak) return true;
    return counts.codeforces > 0 && counts.leetcode > 0;
  }

  let current = 0;
  let checkDate = new Date();

  if (!qualifiesForStreak(today)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (true) {
    const key = formatDateKey(checkDate);
    if (!qualifiesForStreak(key)) break;
    current++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  const sortedKeys = Object.keys(submissionsByDate).sort();
  let longest = 0;
  let run = 0;
  let prevDate = null;

  for (const key of sortedKeys) {
    if (!qualifiesForStreak(key)) {
      run = 0;
      prevDate = null;
      continue;
    }

    if (prevDate === null) {
      run = 1;
    } else {
      const prev = parseDateKey(prevDate);
      const curr = parseDateKey(key);
      const diffDays = Math.round((curr - prev) / 86400000);
      run = diffDays === 1 ? run + 1 : 1;
    }

    if (run > longest) longest = run;
    prevDate = key;
  }

  return { current, longest };
}
