/**
 * LeetCode API client using the public GraphQL endpoint.
 *
 * The public `recentAcSubmissionList` query returns up to 20 recent AC
 * submissions without authentication. For full history the user can supply
 * their LEETCODE_SESSION cookie via the Options page; the cookie is forwarded
 * automatically by the browser because the extension has host_permissions for
 * leetcode.com.
 *
 * Normalized submission shape:
 * {
 *   platform: "leetcode",
 *   problemId: string,     // slug, e.g. "two-sum"
 *   problemName: string,
 *   timestamp: number,     // Unix seconds
 * }
 */

const LC_GRAPHQL_URL = "https://leetcode.com/graphql";

const RECENT_AC_QUERY = `
  query recentAcSubmissions($username: String!, $limit: Int!) {
    recentAcSubmissionList(username: $username, limit: $limit) {
      id
      title
      titleSlug
      timestamp
    }
  }
`;

/**
 * Fetches recent accepted LeetCode submissions for a given username.
 * The public API is limited to the last 20 submissions.
 * Authentication (session cookie) is forwarded automatically by the browser
 * when the user is logged in to LeetCode.
 *
 * @param {string} username
 * @param {number} [limit=20]
 * @returns {Promise<{submissions: Array, error: string|null}>}
 */
async function getLeetCodeSubmissions(username, limit = 20) {
  if (!username) return { submissions: [], error: null };

  try {
    const response = await fetch(LC_GRAPHQL_URL, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Referer: "https://leetcode.com",
      },
      body: JSON.stringify({
        query: RECENT_AC_QUERY,
        variables: { username, limit },
      }),
    });

    if (!response.ok) {
      return { submissions: [], error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    if (data.errors) {
      const msg = data.errors.map((e) => e.message).join("; ");
      return { submissions: [], error: msg };
    }

    const list = data?.data?.recentAcSubmissionList ?? [];

    const submissions = list.map((s) => ({
      platform: PLATFORMS.LEETCODE,
      problemId: s.titleSlug,
      problemName: s.title,
      timestamp: Number(s.timestamp),
    }));

    return { submissions, error: null };
  } catch (err) {
    return { submissions: [], error: err.message };
  }
}
