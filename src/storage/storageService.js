/**
 * Storage schema (browser.storage.local):
 *
 * settings: {
 *   codeforcesHandle: string,
 *   leetcodeHandle: string,
 *   weeklyGoal: number,
 *   dailyMinGoal: number,
 * }
 *
 * submissions: {
 *   [dateKey: "YYYY-MM-DD"]: [
 *     { platform: string, problemId: string, problemName: string, timestamp: number }
 *   ]
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
 * @returns {Promise<{codeforcesHandle:string, leetcodeHandle:string, weeklyGoal:number, dailyMinGoal:number}>}
 */
async function getSettings() {
  const result = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
  return result[STORAGE_KEYS.SETTINGS] ?? {
    codeforcesHandle: DEFAULTS.codeforcesHandle,
    leetcodeHandle: DEFAULTS.leetcodeHandle,
    weeklyGoal: DEFAULTS.weeklyGoal,
    dailyMinGoal: DEFAULTS.dailyMinGoal,
  };
}

/**
 * @param {Partial<{codeforcesHandle:string, leetcodeHandle:string, weeklyGoal:number, dailyMinGoal:number}>} updates
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
 * Returns all submissions keyed by date.
 * @returns {Promise<Object.<string, Array>>}
 */
async function getAllSubmissions() {
  const result = await browser.storage.local.get(STORAGE_KEYS.SUBMISSIONS);
  return result[STORAGE_KEYS.SUBMISSIONS] ?? {};
}

/**
 * Returns submissions for a specific date.
 * @param {string} dateKey  "YYYY-MM-DD"
 * @returns {Promise<Array>}
 */
async function getSubmissionsByDate(dateKey) {
  const all = await getAllSubmissions();
  return all[dateKey] ?? [];
}

/**
 * Merges new submissions into storage for a given date, deduplicating by platform+problemId.
 * @param {string} dateKey
 * @param {Array<{platform:string, problemId:string, problemName:string, timestamp:number}>} newSubmissions
 */
async function mergeSubmissions(dateKey, newSubmissions) {
  const all = await getAllSubmissions();
  const existing = all[dateKey] ?? [];

  const seen = new Set(existing.map((s) => `${s.platform}:${s.problemId}`));
  const toAdd = newSubmissions.filter(
    (s) => !seen.has(`${s.platform}:${s.problemId}`)
  );

  if (toAdd.length === 0) return;

  all[dateKey] = [...existing, ...toAdd];
  await browser.storage.local.set({ [STORAGE_KEYS.SUBMISSIONS]: all });
}

/**
 * Replaces all submissions for a full sync pass.
 * Existing dates not present in the new map are left untouched (incremental merge).
 * @param {Object.<string, Array>} submissionsByDate
 */
async function bulkMergeSubmissions(submissionsByDate) {
  for (const [dateKey, subs] of Object.entries(submissionsByDate)) {
    await mergeSubmissions(dateKey, subs);
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
      },
      [STORAGE_KEYS.SUBMISSIONS]: {},
      [STORAGE_KEYS.LAST_SYNC]: {},
    });
  }
}
