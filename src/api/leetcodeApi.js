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
 * @returns {Promise<{ calendar: Object.<string, number>|null, error: string|null, userNotFound: boolean }>}
 *   `calendar` maps UTC-midnight Unix timestamps (as strings) → daily count.
 *   `userNotFound` is true when LeetCode has no user for this handle (matchedUser === null).
 */
async function getLeetCodeSubmissionCalendar(username) {
  if (!username) return { calendar: null, error: null, userNotFound: false };

  try {
    const response = await fetchWithTimeout(LC_GRAPHQL_URL, {
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
      return { calendar: null, error: `HTTP ${response.status}`, userNotFound: false };
    }

    const data = await response.json();

    if (data.errors) {
      const msg = data.errors.map((e) => e.message).join("; ");
      return { calendar: null, error: msg, userNotFound: false };
    }

    const matchedUser = data?.data?.matchedUser;
    if (matchedUser === null) {
      return { calendar: null, error: null, userNotFound: true };
    }

    const calendarJson = matchedUser?.submissionCalendar;

    if (!calendarJson) {
      return { calendar: {}, error: null, userNotFound: false };
    }

    return { calendar: parseSubmissionCalendar(calendarJson), error: null, userNotFound: false };
  } catch (err) {
    return { calendar: null, error: err.message, userNotFound: false };
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
 *
 * @param {Object.<string, number>} calendar  
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
    result[dateKey] = (result[dateKey] ?? 0) + count;
  }
  return result;
}

/**
 * Sums submission counts from a dateKey → count map for the given date keys.
 *
 * Safe to call with date keys outside the calendar range — they contribute 0.
 *
 * @param {Object.<string, number>} dateCounts 
 * @param {string[]} dateKeys 
 * @returns {number}
 */
function sumSubmissionsForDates(dateCounts, dateKeys) {
  return dateKeys.reduce((sum, key) => sum + (dateCounts[key] ?? 0), 0);
}
