/**
 * statsService — pure business logic, no storage or API calls.
 * All functions receive data as arguments and return plain values.
 */

/**
 * Count the number of problems solved on a specific date.
 * @param {string} dateKey  "YYYY-MM-DD"
 * @param {Object.<string, Array>} submissionsByDate
 * @returns {number}
 */
function getDailyCount(dateKey, submissionsByDate) {
  return (submissionsByDate[dateKey] ?? []).length;
}

/**
 * Sum all problems solved in the current calendar week (Mon–Sun).
 * @param {Object.<string, Array>} submissionsByDate
 * @returns {number}
 */
function getWeeklySolvedCount(submissionsByDate) {
  const today = getTodayKey();
  const weekStart = getStartOfWeekKey();
  const days = getDaysInRange(weekStart, today);
  return days.reduce((sum, d) => sum + getDailyCount(d, submissionsByDate), 0);
}

/**
 * Returns structured weekly progress.
 * @param {Object.<string, Array>} submissionsByDate
 * @param {number} weeklyGoal
 * @returns {{ solved: number, goal: number, percentage: number }}
 */
function getWeeklyProgress(submissionsByDate, weeklyGoal) {
  const solved = getWeeklySolvedCount(submissionsByDate);
  const percentage = weeklyGoal > 0 ? Math.min(100, Math.round((solved / weeklyGoal) * 100)) : 0;
  return { solved, goal: weeklyGoal, percentage };
}

/**
 * Returns whether the daily minimum goal has been met today.
 * @param {Object.<string, Array>} submissionsByDate
 * @param {number} dailyMinGoal
 * @returns {boolean}
 */
function isDailyGoalMet(submissionsByDate, dailyMinGoal) {
  return getDailyCount(getTodayKey(), submissionsByDate) >= dailyMinGoal;
}

/**
 * Aggregated stats object used by the popup.
 * @param {Object.<string, Array>} submissionsByDate
 * @param {{ weeklyGoal: number, dailyMinGoal: number }} settings
 * @returns {{
 *   todayCount: number,
 *   weeklyProgress: { solved: number, goal: number, percentage: number },
 *   dailyGoalMet: boolean,
 * }}
 */
function computeStats(submissionsByDate, settings) {
  const { weeklyGoal, dailyMinGoal } = settings;
  return {
    todayCount: getDailyCount(getTodayKey(), submissionsByDate),
    weeklyProgress: getWeeklyProgress(submissionsByDate, weeklyGoal),
    dailyGoalMet: isDailyGoalMet(submissionsByDate, dailyMinGoal),
  };
}
