/**
 * Storage schema (browser.storage.local):
 *
 * settings: {
 *   codeforcesHandle: string,
 *   leetcodeHandle: string,
 *   weeklyGoal: number,
 *   dailyMinGoal: number,
 *   requireBothSitesForStreak: boolean,
 * }
 *
 * submissions: {
 *   [dateKey: "YYYY-MM-DD"]: {
 *     [platform: string]: [
 *       { platform: string, problemId: string, problemName: string, timestamp: number }
 *     ]
 *   }
 * }
 *
 * lastSync: {
 *   [platform: string]: number  // Unix timestamp (ms)
 * }
 */

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<{codeforcesHandle:string, leetcodeHandle:string, weeklyGoal:number, dailyMinGoal:number, requireBothSitesForStreak:boolean}>}
 */
async function getSettings() {
  const result = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
  const stored = result[STORAGE_KEYS.SETTINGS] ?? {};
  return {
    codeforcesHandle: DEFAULTS.codeforcesHandle,
    leetcodeHandle: DEFAULTS.leetcodeHandle,
    weeklyGoal: DEFAULTS.weeklyGoal,
    dailyMinGoal: DEFAULTS.dailyMinGoal,
    requireBothSitesForStreak: DEFAULTS.requireBothSitesForStreak,
    ...stored,
  };
}

/**
 * @param {Partial<{codeforcesHandle:string, leetcodeHandle:string, weeklyGoal:number, dailyMinGoal:number, requireBothSitesForStreak:boolean}>} updates
 */
async function setSettings(updates) {
  const current = await getSettings();
  await browser.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: { ...current, ...updates },
  });
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

/**
 * Normalizes one date bucket into platform-separated arrays.
 * Supports legacy shape where one date directly stored a flat array.
 * @param {Array|Object|undefined} bucket
 * @returns {Object.<string, Array>}
 */
function normalizeDateBucket(bucket) {
  const normalized = {
    [PLATFORMS.CODEFORCES]: [],
    [PLATFORMS.LEETCODE]: [],
  };

  if (Array.isArray(bucket)) {
    for (const sub of bucket) {
      if (!sub?.platform) continue;
      if (!normalized[sub.platform]) normalized[sub.platform] = [];
      normalized[sub.platform].push(sub);
    }
    return normalized;
  }

  if (bucket && typeof bucket === "object") {
    for (const [platform, submissions] of Object.entries(bucket)) {
      if (!Array.isArray(submissions)) continue;
      normalized[platform] = submissions;
    }
  }

  return normalized;
}

/**
 * Returns all submissions keyed by date.
 * @returns {Promise<Object.<string, Object.<string, Array>>>}
 */
async function getAllSubmissions() {
  const result = await browser.storage.local.get(STORAGE_KEYS.SUBMISSIONS);
  const raw = result[STORAGE_KEYS.SUBMISSIONS] ?? {};
  const normalized = {};
  for (const [dateKey, bucket] of Object.entries(raw)) {
    normalized[dateKey] = normalizeDateBucket(bucket);
  }
  return normalized;
}

/**
 * Returns submissions for a specific date.
 * @param {string} dateKey  "YYYY-MM-DD"
 * @returns {Promise<Object.<string, Array>>}
 */
async function getSubmissionsByDate(dateKey) {
  const all = await getAllSubmissions();
  return all[dateKey] ?? normalizeDateBucket();
}

/**
 * Merges new submissions into storage for a given date and platform.
 * Deduplication key is platform+problemId.
 * @param {string} dateKey
 * @param {Array<{platform:string, problemId:string, problemName:string, timestamp:number}>} newSubmissions
 */
async function mergeSubmissions(dateKey, platform, newSubmissions) {
  if (!newSubmissions || newSubmissions.length === 0) return;

  const all = await getAllSubmissions();
  const bucket = all[dateKey] ?? normalizeDateBucket();
  const existing = bucket[platform] ?? [];

  const seen = new Set(existing.map((s) => `${s.platform}:${s.problemId}`));
  const toAdd = newSubmissions.filter(
    (s) => !seen.has(`${s.platform}:${s.problemId}`)
  );

  if (toAdd.length === 0) return;

  bucket[platform] = [...existing, ...toAdd];
  all[dateKey] = bucket;
  await browser.storage.local.set({ [STORAGE_KEYS.SUBMISSIONS]: all });
}

/**
 * Replaces all submissions for a full sync pass.
 * Existing dates not present in the new map are left untouched (incremental merge).
 * @param {string} platform
 * @param {Object.<string, Array>} submissionsByDate
 */
async function bulkMergeSubmissions(platform, submissionsByDate) {
  for (const [dateKey, subs] of Object.entries(submissionsByDate)) {
    await mergeSubmissions(dateKey, platform, subs);
  }
}

// ---------------------------------------------------------------------------
// Last sync timestamps
// ---------------------------------------------------------------------------

/**
 * @param {string} platform
 * @returns {Promise<number>}  Unix timestamp in ms, or 0 if never synced.
 */
async function getLastSync(platform) {
  const result = await browser.storage.local.get(STORAGE_KEYS.LAST_SYNC);
  const lastSync = result[STORAGE_KEYS.LAST_SYNC] ?? {};
  return lastSync[platform] ?? 0;
}

/**
 * @param {string} platform
 * @param {number} timestampMs  Unix timestamp in ms.
 */
async function setLastSync(platform, timestampMs) {
  const result = await browser.storage.local.get(STORAGE_KEYS.LAST_SYNC);
  const lastSync = result[STORAGE_KEYS.LAST_SYNC] ?? {};
  lastSync[platform] = timestampMs;
  await browser.storage.local.set({ [STORAGE_KEYS.LAST_SYNC]: lastSync });
}

// ---------------------------------------------------------------------------
// Initialise defaults on first install
// ---------------------------------------------------------------------------

async function initDefaults() {
  const existing = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
  if (!existing[STORAGE_KEYS.SETTINGS]) {
    await browser.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: {
        codeforcesHandle: DEFAULTS.codeforcesHandle,
        leetcodeHandle: DEFAULTS.leetcodeHandle,
        weeklyGoal: DEFAULTS.weeklyGoal,
        dailyMinGoal: DEFAULTS.dailyMinGoal,
        requireBothSitesForStreak: DEFAULTS.requireBothSitesForStreak,
      },
      [STORAGE_KEYS.SUBMISSIONS]: {},
      [STORAGE_KEYS.LAST_SYNC]: {},
    });
  }
}
