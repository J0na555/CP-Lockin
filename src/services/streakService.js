/**
 * streakService — streak calculation logic.
 * A streak is a consecutive sequence of days (ending today or yesterday)
 * where the user solved at least dailyMinGoal problems.
 */

/**
 * Calculates the current and longest streaks.
 *
 * "Current" streak:
 *   - Walk backward from today. If today has no solves, check yesterday (a
 *     streak can still be active if today's data hasn't been synced yet).
 *   - Stop at the first day with fewer than dailyMinGoal solves.
 *
 * "Longest" streak:
 *   - Scan all stored dates in ascending order.
 *
 * @param {Object.<string, Array>} submissionsByDate
 * @param {number} [dailyMinGoal=1]
 * @returns {{ current: number, longest: number }}
 */
function calculateStreak(submissionsByDate, dailyMinGoal = 1) {
  const today = getTodayKey();

  // ---- current streak ----
  let current = 0;
  let checkDate = new Date();

  // If no solves today, check from yesterday (streak still valid)
  const todayCount = (submissionsByDate[today] ?? []).length;
  if (todayCount < dailyMinGoal) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (true) {
    const key = formatDateKey(checkDate);
    const count = (submissionsByDate[key] ?? []).length;
    if (count < dailyMinGoal) break;
    current++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  // ---- longest streak ----
  const sortedKeys = Object.keys(submissionsByDate).sort();
  let longest = 0;
  let run = 0;
  let prevDate = null;

  for (const key of sortedKeys) {
    const count = (submissionsByDate[key] ?? []).length;
    if (count < dailyMinGoal) {
      run = 0;
      prevDate = null;
      continue;
    }

    if (prevDate === null) {
      run = 1;
    } else {
      const prev = new Date(prevDate + "T00:00:00");
      const curr = new Date(key + "T00:00:00");
      const diffDays = Math.round((curr - prev) / 86400000);
      run = diffDays === 1 ? run + 1 : 1;
    }

    if (run > longest) longest = run;
    prevDate = key;
  }

  return { current, longest };
}
