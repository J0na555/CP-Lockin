/**
 * Format a Date (or current date) as "YYYY-MM-DD" in local time.
 * @param {Date} [date]
 * @returns {string}
 */
function formatDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parses "YYYY-MM-DD" as a local calendar date (avoids UTC shifts from ISO strings).
 * @param {string} key
 * @returns {Date}
 */
function parseDateKey(key) {
  const [y, m, d] = key.split("-");
  return new Date(y, m - 1, d);
}

/**
 * Returns today's date key in "YYYY-MM-DD".
 * @returns {string}
 */
function getTodayKey() {
  return formatDateKey(new Date());
}

/**
 * Returns the date key for a given Unix timestamp (seconds).
 * @param {number} timestampSeconds
 * @returns {string}
 */
function timestampToDateKey(timestampSeconds) {
  return formatDateKey(new Date(timestampSeconds * 1000));
}

/**
 * Returns the Monday of the week containing the given date as "YYYY-MM-DD".
 * @param {Date} [date]
 * @returns {string}
 */
function getStartOfWeekKey(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday ...
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return formatDateKey(d);
}

/**
 * Returns an array of "YYYY-MM-DD" keys for every day from startKey to endKey (inclusive).
 * @param {string} startKey  "YYYY-MM-DD"
 * @param {string} endKey    "YYYY-MM-DD"
 * @returns {string[]}
 */
function getDaysInRange(startKey, endKey) {
  const dates = [];
  const current = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  while (current <= end) {
    dates.push(formatDateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * Returns the date key for N days before the given date.
 * @param {number} n
 * @param {Date} [from]
 * @returns {string}
 */
function daysAgoKey(n, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return formatDateKey(d);
}
