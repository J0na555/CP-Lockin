/**
 * Formats a Date as "YYYY-MM-DD" using local time.
 * @param {Date} date
 * @returns {string}
 */
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns the day-of-week index for grid row placement.
 * Monday = 0, Tuesday = 1, …, Sunday = 6
 * @param {string} dateKey "YYYY-MM-DD"
 * @returns {number}
 */
function getDayOfWeek(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  return (d.getDay() + 6) % 7;
}

/**
 * Returns the 0-based week index of a date relative to the heatmap start date.
 * @param {string} dateKey  "YYYY-MM-DD"
 * @param {string} startKey "YYYY-MM-DD"
 * @returns {number}
 */
function getWeekIndex(dateKey, startKey) {
  const date = new Date(dateKey + "T00:00:00");
  const start = new Date(startKey + "T00:00:00");
  const diffDays = Math.round((date - start) / 86400000);
  return Math.floor(diffDays / 7);
}

/**
 * Generates the full date range for the heatmap.
 * Starts on the Monday of the week that was `weeks` full weeks before today's week,
 * and ends on today. This always produces complete week-aligned columns.
 *
 * @param {number} [weeks=52]
 * @returns {{ startKey: string, endKey: string, dates: string[] }}
 */
function getHeatmapRange(weeks = 52) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Monday of the current week
  const currentDow = (today.getDay() + 6) % 7;
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - currentDow);

  // Monday `weeks` full weeks before the current week's Monday
  const startDate = new Date(currentMonday);
  startDate.setDate(currentMonday.getDate() - weeks * 7);

  const dates = [];
  const cursor = new Date(startDate);
  while (cursor <= today) {
    dates.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    startKey: formatDateKey(startDate),
    endKey: formatDateKey(today),
    dates,
  };
}

/**
 * Calendar week containing `date` (local time): Monday–Sunday as "YYYY-MM-DD" keys.
 * @param {Date} [date=new Date()]
 * @returns {string[]}
 */
function getCalendarWeekDateKeys(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow);
  const keys = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    keys.push(formatDateKey(day));
  }
  return keys;
}
