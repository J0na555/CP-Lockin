/**
 * Codeforces API client.
 *
 * Normalized submission shape:
 * {
 *   platform: "codeforces",
 *   problemId: string,     // e.g. "1234A"
 *   problemName: string,
 *   timestamp: number,     // Unix seconds
 * }
 */

const CF_API_BASE = "https://codeforces.com/api";

/**
 * Fetches all accepted (verdict === "OK") submissions for a Codeforces handle.
 * Codeforces paginates at count=10000 max; we request a large batch which covers
 * most active users. For very prolific users a paging strategy can be added.
 *
 * @param {string} handle
 * @returns {Promise<{submissions: Array, error: string|null}>}
 */
async function getCodeforcesSubmissions(handle) {
  if (!handle) return { submissions: [], error: null };

  const url = `${CF_API_BASE}/user.status?handle=${encodeURIComponent(handle)}&from=1&count=10000`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { submissions: [], error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    if (data.status !== "OK") {
      return { submissions: [], error: data.comment ?? "Unknown Codeforces error" };
    }

    const submissions = data.result
      .filter((s) => s.verdict === "OK")
      .map((s) => ({
        platform: PLATFORMS.CODEFORCES,
        problemId: `${s.problem.contestId ?? ""}${s.problem.index}`,
        problemName: s.problem.name,
        timestamp: s.creationTimeSeconds,
      }));

    return { submissions, error: null };
  } catch (err) {
    return { submissions: [], error: err.message };
  }
}
