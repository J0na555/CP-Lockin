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
 *       {
 *         platform: string,
 *         submissionId?: string,
 *         problemId: string | null,
 *         problemName: string,
 *         timestamp: number,
 *         handle?: string,
 *         problemLink?: string,
 *         verdict?: string,
 *         language?: string,
 *         source?: "regular" | "gym"
 *       }
 *     ]
 *   }
 * }
 *
 * cfDomSubmissions: {
 *   [handle: string]: Array<object>  // staged scraped CF rows awaiting sync merge
 * }
 *
 * lastSync: {
 *   [platform: string]: number  // Unix timestamp (ms)
 * }
 *
 * cfIncrementalSync: {
 *   handle: string,
 *   lastSyncTimestamp: number  // Unix seconds — max creationTimeSeconds of synced CF ACs
 * }
 *
 * syncStatus: {
 *   lastAttempt: number,
 *   errors: string[]
 * }
 *
 * leetcodeCalendarMeta: { handle: string, userFound: boolean }
 *
 * leetcodeCalendarArchive: { [handle: string]: { [dateKey: string]: number } }
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
 * Codeforces deduplicates by submissionId with a legacy fallback key.
 * Other platforms keep their existing platform+problemId behavior.
 * @param {string} dateKey
 * @param {Array<{platform:string, submissionId?:string, problemId:string|null, problemName:string, timestamp:number}>} newSubmissions
 */
function areSubmissionArraysEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function mergeSubmissions(dateKey, platform, newSubmissions) {
  if (!newSubmissions || newSubmissions.length === 0) return;

  const all = await getAllSubmissions();
  const bucket = all[dateKey] ?? normalizeDateBucket();
  const existing = bucket[platform] ?? [];
  let merged;

  if (platform === PLATFORMS.CODEFORCES) {
    merged = mergeCodeforcesSubmissionCollections(existing, newSubmissions);
    if (areSubmissionArraysEqual(existing, merged)) return;
  } else {
    const seen = new Set(existing.map((s) => `${s.platform}:${s.problemId}`));
    const toAdd = newSubmissions.filter(
      (s) => !seen.has(`${s.platform}:${s.problemId}`)
    );
    if (toAdd.length === 0) return;
    merged = [...existing, ...toAdd];
  }

  bucket[platform] = merged;
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

/**
 * Buffered DOM-scraped Codeforces submissions, keyed by handle.
 * @returns {Promise<Object.<string, Array<object>>>}
 */
async function getCodeforcesDomSubmissions() {
  const result = await browser.storage.local.get(STORAGE_KEYS.CF_DOM_SUBMISSIONS);
  const raw = result[STORAGE_KEYS.CF_DOM_SUBMISSIONS];
  return raw && typeof raw === "object" ? raw : {};
}

/**
 * @param {string} handle
 * @returns {Promise<Array<object>>}
 */
async function getCodeforcesDomSubmissionsForHandle(handle) {
  const normalizedHandle = (handle ?? "").trim();
  if (!normalizedHandle) return [];

  const buffered = await getCodeforcesDomSubmissions();
  const submissions = buffered[normalizedHandle];
  return Array.isArray(submissions) ? submissions : [];
}

/**
 * Stores normalized DOM-scraped Codeforces rows until the next sync merge.
 *
 * @param {string} handle
 * @param {Array<object>} submissions
 * @returns {Promise<Array<object>>}
 */
async function stageCodeforcesDomSubmissions(handle, submissions) {
  const normalizedHandle = (handle ?? "").trim();
  if (!normalizedHandle) return [];

  const normalizedSubmissions = (Array.isArray(submissions) ? submissions : [])
    .map((submission) => normalizeCodeforcesDomSubmission(submission))
    .filter(Boolean);
  if (normalizedSubmissions.length === 0) {
    return getCodeforcesDomSubmissionsForHandle(normalizedHandle);
  }

  const buffered = await getCodeforcesDomSubmissions();
  const existing = Array.isArray(buffered[normalizedHandle]) ? buffered[normalizedHandle] : [];
  buffered[normalizedHandle] = mergeCodeforcesSubmissionCollections(
    existing,
    normalizedSubmissions
  );

  await browser.storage.local.set({ [STORAGE_KEYS.CF_DOM_SUBMISSIONS]: buffered });
  return buffered[normalizedHandle];
}

/**
 * @param {string} handle
 */
async function clearCodeforcesDomSubmissionsForHandle(handle) {
  const normalizedHandle = (handle ?? "").trim();
  if (!normalizedHandle) return;

  const buffered = await getCodeforcesDomSubmissions();
  if (!(normalizedHandle in buffered)) return;

  delete buffered[normalizedHandle];
  await browser.storage.local.set({ [STORAGE_KEYS.CF_DOM_SUBMISSIONS]: buffered });
}

// ---------------------------------------------------------------------------
// Codeforces incremental sync cursor
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<{ handle: string, lastSyncTimestamp: number }>}
 */
async function getCfIncrementalSync() {
  const result = await browser.storage.local.get(STORAGE_KEYS.CF_INCREMENTAL_SYNC);
  const raw = result[STORAGE_KEYS.CF_INCREMENTAL_SYNC];
  return {
    handle: typeof raw?.handle === "string" ? raw.handle : "",
    lastSyncTimestamp: Number(raw?.lastSyncTimestamp) || 0,
  };
}

/**
 * @param {Partial<{ handle: string, lastSyncTimestamp: number }>} partial
 */
async function setCfIncrementalSync(partial) {
  const current = await getCfIncrementalSync();
  await browser.storage.local.set({
    [STORAGE_KEYS.CF_INCREMENTAL_SYNC]: { ...current, ...partial },
  });
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
// Sync status
// ---------------------------------------------------------------------------

/**
 * Returns the latest sync attempt status.
 * @returns {Promise<{ lastAttempt: number, errors: string[] }>}
 */
async function getSyncStatus() {
  const result = await browser.storage.local.get(STORAGE_KEYS.SYNC_STATUS);
  const status = result[STORAGE_KEYS.SYNC_STATUS] ?? {};
  return {
    lastAttempt: Number(status.lastAttempt) || 0,
    errors: Array.isArray(status.errors) ? status.errors : [],
  };
}

/**
 * Persists the latest sync attempt status.
 * @param {{ lastAttempt: number, errors: string[] }} syncStatus
 */
async function setSyncStatus(syncStatus) {
  await browser.storage.local.set({
    [STORAGE_KEYS.SYNC_STATUS]: {
      lastAttempt: Number(syncStatus?.lastAttempt) || 0,
      errors: Array.isArray(syncStatus?.errors) ? syncStatus.errors : [],
    },
  });
}

// ---------------------------------------------------------------------------
// LeetCode submission calendar
// ---------------------------------------------------------------------------

/**
 * Returns the stored LeetCode calendar date-count map.
 * @returns {Promise<Object.<string, number>>}  { [dateKey: "YYYY-MM-DD"]: count }
 */
async function getLeetCodeCalendar() {
  const result = await browser.storage.local.get(STORAGE_KEYS.LEETCODE_CALENDAR);
  return result[STORAGE_KEYS.LEETCODE_CALENDAR] ?? {};
}

/**
 * Persists the LeetCode calendar date-count map (full replace).
 * @param {Object.<string, number>} calendarByDate  { [dateKey: "YYYY-MM-DD"]: count }
 */
async function setLeetCodeCalendar(calendarByDate) {
  await browser.storage.local.set({
    [STORAGE_KEYS.LEETCODE_CALENDAR]: calendarByDate,
  });
}

/**
 * @returns {Promise<{ handle: string, userFound: boolean }>}
 */
async function getLeetCodeCalendarMeta() {
  const result = await browser.storage.local.get(STORAGE_KEYS.LEETCODE_CALENDAR_META);
  const raw = result[STORAGE_KEYS.LEETCODE_CALENDAR_META];
  if (!raw || typeof raw !== "object") {
    return { handle: "", userFound: true };
  }
  return {
    handle: typeof raw.handle === "string" ? raw.handle : "",
    userFound: raw.userFound !== false,
  };
}

/**
 * @param {{ handle: string, userFound: boolean }} meta
 */
async function setLeetCodeCalendarMeta(meta) {
  await browser.storage.local.set({
    [STORAGE_KEYS.LEETCODE_CALENDAR_META]: {
      handle: typeof meta?.handle === "string" ? meta.handle : "",
      userFound: meta?.userFound !== false,
    },
  });
}

/**
 * @returns {Promise<Object.<string, Object.<string, number>>>}
 */
async function getLeetCodeCalendarArchive() {
  const result = await browser.storage.local.get(STORAGE_KEYS.LEETCODE_CALENDAR_ARCHIVE);
  const raw = result[STORAGE_KEYS.LEETCODE_CALENDAR_ARCHIVE];
  return raw && typeof raw === "object" ? raw : {};
}

/**
 * Date-keyed LeetCode counts that apply to the configured handle (or legacy untagged data).
 *
 * @param {{ leetcodeHandle?: string }} settings
 * @returns {Promise<Object.<string, number>>}
 */
async function getLeetCodeDateCountsForSettings(settings) {
  const h = (settings.leetcodeHandle ?? "").trim();
  if (!h) return {};

  const [calResult, rawMetaResult] = await Promise.all([
    browser.storage.local.get(STORAGE_KEYS.LEETCODE_CALENDAR),
    browser.storage.local.get(STORAGE_KEYS.LEETCODE_CALENDAR_META),
  ]);
  const calendar = calResult[STORAGE_KEYS.LEETCODE_CALENDAR] ?? {};
  const rawMeta = rawMetaResult[STORAGE_KEYS.LEETCODE_CALENDAR_META];

  if (rawMeta === undefined) {
    return calendar;
  }

  const meta = {
    handle: typeof rawMeta.handle === "string" ? rawMeta.handle : "",
    userFound: rawMeta.userFound !== false,
  };
  if (meta.userFound === false && meta.handle === h) return {};
  if (meta.userFound && meta.handle === h) return calendar;
  return {};
}

/**
 * @param {{ leetcodeHandle?: string }} settings
 * @param {{ handle: string, userFound: boolean }} meta
 * @returns {boolean}
 */
function isLeetCodeUserNotFound(settings, meta) {
  const h = (settings.leetcodeHandle ?? "").trim();
  if (!h) return false;
  if (!meta || typeof meta !== "object") return false;
  const mh = (meta.handle ?? "").trim();
  return meta.userFound === false && mh === h;
}

/**
 * @param {{ leetcodeHandle?: string }} settings
 * @returns {Promise<boolean>}
 */
async function isLeetCodeUserNotFoundForSettings(settings) {
  return isLeetCodeUserNotFound(settings, await getLeetCodeCalendarMeta());
}

/**
 * @param {Object.<string, Object.<string, Array>>} submissionsByDate
 * @param {{ codeforcesHandle?: string, leetcodeHandle?: string }} settings
 * @returns {Object.<string, Object.<string, Array>>}
 */
function filterSubmissionsByPlatformHandles(submissionsByDate, settings) {
  const cfH = (settings.codeforcesHandle ?? "").trim();
  const lcH = (settings.leetcodeHandle ?? "").trim();
  const out = {};

  for (const [dateKey, bucket] of Object.entries(submissionsByDate)) {
    if (!bucket || typeof bucket !== "object") continue;
    const cfRaw = bucket[PLATFORMS.CODEFORCES] ?? [];
    const lcRaw = bucket[PLATFORMS.LEETCODE] ?? [];
    const cf = Array.isArray(cfRaw)
      ? cfRaw.filter((s) => !s?.handle || s.handle === cfH)
      : [];
    const lc = Array.isArray(lcRaw)
      ? lcRaw.filter((s) => !s?.handle || s.handle === lcH)
      : [];
    if (cf.length > 0 || lc.length > 0) {
      out[dateKey] = {
        ...bucket,
        [PLATFORMS.CODEFORCES]: cf,
        [PLATFORMS.LEETCODE]: lc,
      };
    }
  }
  return out;
}

/**
 * Moves the active LeetCode calendar into the archive under `oldHandle`, then clears the active key.
 *
 * @param {string} oldHandle
 */
async function archiveCurrentLeetCodeCalendar(oldHandle) {
  const h = oldHandle.trim();
  if (!h) return;

  const current = (await browser.storage.local.get(STORAGE_KEYS.LEETCODE_CALENDAR))[
    STORAGE_KEYS.LEETCODE_CALENDAR
  ];
  if (!current || typeof current !== "object" || Object.keys(current).length === 0) {
    return;
  }

  const arch = await getLeetCodeCalendarArchive();
  const prev = arch[h] && typeof arch[h] === "object" ? arch[h] : {};
  const merged = { ...prev };
  for (const [dk, n] of Object.entries(current)) {
    const add = Number(n);
    merged[dk] = (merged[dk] ?? 0) + (Number.isFinite(add) ? add : 0);
  }
  arch[h] = merged;

  await browser.storage.local.set({
    [STORAGE_KEYS.LEETCODE_CALENDAR_ARCHIVE]: arch,
    [STORAGE_KEYS.LEETCODE_CALENDAR]: {},
  });
}

/**
 * Sets `handle` on stored submission rows that do not have one (legacy / pre-tag data).
 *
 * @param {{ codeforcesHandle?: string, leetcodeHandle?: string }} handles
 */
async function tagSubmissionsWithHandles(handles) {
  const cfTag = (handles.codeforcesHandle ?? "").trim();
  const lcTag = (handles.leetcodeHandle ?? "").trim();
  if (!cfTag && !lcTag) return;

  const all = await getAllSubmissions();
  let dirty = false;

  for (const dateKey of Object.keys(all)) {
    const bucket = all[dateKey];
    if (!bucket || typeof bucket !== "object") continue;

    const cf = bucket[PLATFORMS.CODEFORCES];
    if (cfTag && Array.isArray(cf)) {
      for (const sub of cf) {
        if (sub && typeof sub === "object" && !sub.handle) {
          sub.handle = cfTag;
          dirty = true;
        }
      }
    }

    const lc = bucket[PLATFORMS.LEETCODE];
    if (lcTag && Array.isArray(lc)) {
      for (const sub of lc) {
        if (sub && typeof sub === "object" && !sub.handle) {
          sub.handle = lcTag;
          dirty = true;
        }
      }
    }
  }

  if (dirty) {
    await browser.storage.local.set({ [STORAGE_KEYS.SUBMISSIONS]: all });
  }
}

/**
 * Clears submissions, LeetCode calendar state, weekly snapshots, and sync cursors (full reset).
 *
 * @param {{ codeforcesHandle: string, leetcodeHandle: string }} nextHandles  Handles after save (may be empty).
 */
async function clearAllTrackingData(nextHandles) {
  await browser.storage.local.set({
    [STORAGE_KEYS.SUBMISSIONS]: {},
    [STORAGE_KEYS.CF_DOM_SUBMISSIONS]: {},
    [STORAGE_KEYS.LEETCODE_CALENDAR]: {},
    [STORAGE_KEYS.LEETCODE_CALENDAR_META]: {
      handle: (nextHandles.leetcodeHandle ?? "").trim(),
      userFound: true,
    },
    [STORAGE_KEYS.LEETCODE_CALENDAR_ARCHIVE]: {},
    [STORAGE_KEYS.CF_INCREMENTAL_SYNC]: {
      handle: (nextHandles.codeforcesHandle ?? "").trim(),
      lastSyncTimestamp: 0,
    },
    [STORAGE_KEYS.LAST_SYNC]: {},
    [STORAGE_KEYS.WEEKLY_STATS]: {},
    [STORAGE_KEYS.LAST_WEEK_KEY]: "",
    [STORAGE_KEYS.SYNC_STATUS]: { lastAttempt: 0, errors: [] },
  });
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
      [STORAGE_KEYS.CF_DOM_SUBMISSIONS]: {},
      [STORAGE_KEYS.CF_INCREMENTAL_SYNC]: { handle: "", lastSyncTimestamp: 0 },
      [STORAGE_KEYS.LAST_SYNC]: {},
      [STORAGE_KEYS.SYNC_STATUS]: { lastAttempt: 0, errors: [] },
      [STORAGE_KEYS.LEETCODE_CALENDAR]: {},
      [STORAGE_KEYS.LEETCODE_CALENDAR_META]: { handle: "", userFound: true },
      [STORAGE_KEYS.LEETCODE_CALENDAR_ARCHIVE]: {},
      [STORAGE_KEYS.WEEKLY_STATS]: {},
      [STORAGE_KEYS.LAST_WEEK_KEY]: "",
    });
  }
}
