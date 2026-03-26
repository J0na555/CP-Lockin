/**
 * LeetCode API client using the public GraphQL endpoint.
 *
 * Uses the `submissionCalendar` field instead of `recentAcSubmissionList`.
 * The calendar covers roughly one year of activity without the 20-submission
 * cap, making weekly/heatmap tracking accurate.
 *
 * Limitation: the calendar returns total *submission* counts per UTC day, not
 * unique problems solved. See calendarToDateCounts() for the timezone note.
 */

const LC_GRAPHQL_URL = "https://leetcode.com/graphql";

const SUBMISSION_CALENDAR_QUERY = `
  query submissionCalendar($username: String!) {
    matchedUser(username: $username) {
      submissionCalendar
    }
  }
`;

/**
 * Fetches the raw submissionCalendar for a LeetCode user.
 *
 * The field is a JSON-encoded string like:
 *   '{"1609459200": 3, "1609545600": 1, ...}'
 * where keys are Unix timestamps (seconds) aligned to UTC midnight, and
 * values are the number of accepted submissions on that day.
 *
 * Authentication note: `credentials: "include"` forwards the user's
 * LEETCODE_SESSION cookie automatically when the browser has an active
 * LeetCode session, which is required to view another user's calendar on
 * private profiles.
 *
 * @param {string} username
 * @returns {Promise<{ calendar: Object.<string, number>|null, error: string|null }>}
 *   `calendar` maps UTC-midnight Unix timestamps (as strings) → daily count.
 */
async function getLeetCodeSubmissionCalendar(username) {
  if (!username) return { calendar: null, error: null };

  try {
    const response = await fetch(LC_GRAPHQL_URL, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Referer: "https://leetcode.com",
      },
      body: JSON.stringify({
        query: SUBMISSION_CALENDAR_QUERY,
        variables: { username },
      }),
    });

    if (!response.ok) {
      return { calendar: null, error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    if (data.errors) {
      const msg = data.errors.map((e) => e.message).join("; ");
      return { calendar: null, error: msg };
    }

    const calendarJson = data?.data?.matchedUser?.submissionCalendar;

    if (!calendarJson) {
      // Public profile with no activity, or username not found.
      return { calendar: {}, error: null };
    }

    return { calendar: parseSubmissionCalendar(calendarJson), error: null };
  } catch (err) {
    return { calendar: null, error: err.message };
  }
}

/**
 * Parses the raw submissionCalendar JSON string into a plain object.
 *
 * @param {string} jsonStr  e.g. '{"1609459200": 3, "1609545600": 1}'
 * @returns {Object.<string, number>}  { [unixSecondsStr]: submissionCount }
 */
function parseSubmissionCalendar(jsonStr) {
  try {
    return JSON.parse(jsonStr);
  } catch {
    return {};
  }
}

/**
 * Converts a raw submissionCalendar { [unixSeconds]: count } object into a
 * date-keyed map { [dateKey: "YYYY-MM-DD"]: count }.
 *
 * Timezone note: LeetCode stores calendar timestamps as UTC midnight
 * boundaries (e.g. 1609459200 = 2021-01-01 00:00:00 UTC). We extract the
 * date using UTC methods so the keys match LeetCode's own day groupings.
 * For users in strongly negative UTC offsets (e.g. UTC-8), a submission made
 * late in their local evening will appear under the NEXT UTC date in the
 * calendar — this is an inherent limitation of the calendar API and cannot
 * be corrected without individual submission timestamps.
 *
 * @param {Object.<string, number>} calendar  From parseSubmissionCalendar()
 * @returns {Object.<string, number>}
 */
function calendarToDateCounts(calendar) {
  const result = {};
  for (const [tsStr, count] of Object.entries(calendar)) {
    const ms = Number(tsStr) * 1000;
    const d = new Date(ms);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const dateKey = `${year}-${month}-${day}`;
    // Accumulate in case two timestamps collapse to the same UTC date.
    result[dateKey] = (result[dateKey] ?? 0) + count;
  }
  return result;
}

/**
 * Sums submission counts from a dateKey → count map for the given date keys.
 *
 * Safe to call with date keys outside the calendar range — they contribute 0.
 *
 * @param {Object.<string, number>} dateCounts  From calendarToDateCounts()
 * @param {string[]} dateKeys  "YYYY-MM-DD" strings (e.g. from getCalendarWeekDateKeys())
 * @returns {number}
 */
function sumSubmissionsForDates(dateCounts, dateKeys) {
  return dateKeys.reduce((sum, key) => sum + (dateCounts[key] ?? 0), 0);
}
