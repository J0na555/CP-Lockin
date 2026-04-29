/**
 * Returns per-platform and total counts for a date.
 * @param {string} dateKey  "YYYY-MM-DD"
 * @param {Object.<string, Object.<string, Array>>} submissionsByDate
 * @returns {{ codeforces: number, leetcode: number, total: number }}
 */
function getDailyCounts(dateKey, submissionsByDate) {
  const dateBucket = submissionsByDate[dateKey] ?? {};
  const codeforces = (dateBucket[PLATFORMS.CODEFORCES] ?? []).length;
  const leetcode = (dateBucket[PLATFORMS.LEETCODE] ?? []).length;
  return {
    codeforces,
    leetcode,
    total: codeforces + leetcode,
  };
}

/**
 * Sum all accepted submissions in the current calendar week (Mon–Sun).
 * @param {Object.<string, Object.<string, Array>>} submissionsByDate
 * @returns {{ codeforces: number, leetcode: number, total: number }}
 */
function getWeeklySolvedCount(submissionsByDate) {
  const today = getTodayKey();
  const weekStart = getStartOfWeekKey();
  const days = getDaysInRange(weekStart, today);
  return days.reduce(
    (sum, d) => {
      const counts = getDailyCounts(d, submissionsByDate);
      return {
        codeforces: sum.codeforces + counts.codeforces,
        leetcode: sum.leetcode + counts.leetcode,
        total: sum.total + counts.total,
      };
    },
    { codeforces: 0, leetcode: 0, total: 0 }
  );
}

/**
 * Returns structured weekly progress.
 * @param {Object.<string, Object.<string, Array>>} submissionsByDate
 * @param {number} weeklyGoal
 * @returns {{ solved: number, goal: number, percentage: number, byPlatform: { codeforces: number, leetcode: number } }}
 * `solved` is kept as the public field name for compatibility, but it now
 * represents accepted-submission totals.
 */
function getWeeklyProgress(submissionsByDate, weeklyGoal) {
  const weeklyCounts = getWeeklySolvedCount(submissionsByDate);
  const solved = weeklyCounts.total;
  const percentage = weeklyGoal > 0 ? Math.min(100, Math.round((solved / weeklyGoal) * 100)) : 0;
  return {
    solved,
    goal: weeklyGoal,
    percentage,
    byPlatform: {
      codeforces: weeklyCounts.codeforces,
      leetcode: weeklyCounts.leetcode,
    },
  };
}

/**
 * Returns whether the daily minimum goal has been met today.
 * @param {Object.<string, Object.<string, Array>>} submissionsByDate
 * @param {number} dailyMinGoal
 * @returns {boolean}
 */
function isDailyGoalMet(submissionsByDate, dailyMinGoal) {
  return getDailyCounts(getTodayKey(), submissionsByDate).total >= dailyMinGoal;
}

/**
 * Aggregated stats object used by the popup.
 * @param {Object.<string, Object.<string, Array>>} submissionsByDate
 * @param {{ weeklyGoal: number, dailyMinGoal: number }} settings
 * @returns {{
 *   todayCount: number,
 *   todayByPlatform: { codeforces: number, leetcode: number },
 *   weeklyProgress: { solved: number, goal: number, percentage: number },
 *   dailyGoalMet: boolean,
 * }}
 */
function computeStats(submissionsByDate, settings) {
  const { weeklyGoal, dailyMinGoal } = settings;
  const todayCounts = getDailyCounts(getTodayKey(), submissionsByDate);
  return {
    todayCount: todayCounts.total,
    todayByPlatform: {
      codeforces: todayCounts.codeforces,
      leetcode: todayCounts.leetcode,
    },
    weeklyProgress: getWeeklyProgress(submissionsByDate, weeklyGoal),
    dailyGoalMet: isDailyGoalMet(submissionsByDate, dailyMinGoal),
  };
}
