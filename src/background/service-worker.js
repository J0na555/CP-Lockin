if (typeof importScripts === "function") {
  try {
    importScripts("../utils/browserShim.js");
  } catch (err) {
    console.error("Failed to load browser shim", err);
  }
}

if (typeof DEFAULTS === "undefined" && typeof importScripts === "function") {
  try {
    importScripts(
      "../config/defaults.js",
      "../utils/dateUtils.js",
      "../api/codeforcesMerge.js",
      "../storage/storageService.js",
      "../api/codeforcesApi.js",
      "../api/leetcodeApi.js",
      "../api/platformFactory.js",
      "../services/statsService.js",
      "../services/streakService.js",
      "../services/weeklyService.js"
    );
  } catch (err) {
    console.error("Failed to load background dependencies", err);
  }
}

// ---------------------------------------------------------------------------
// Install / startup
// ---------------------------------------------------------------------------

browser.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") {
    await initDefaults();
  }
  scheduleAlarm();
});

browser.runtime.onStartup.addListener(() => {
  scheduleAlarm();
});

// ---------------------------------------------------------------------------
// Periodic alarm
// ---------------------------------------------------------------------------

function scheduleAlarm() {
  browser.alarms.create(SYNC_ALARM_NAME, {
    delayInMinutes: DEFAULTS.syncIntervalMinutes,
    periodInMinutes: DEFAULTS.syncIntervalMinutes,
  });
}

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) {
    runSync().catch(console.error);
  }
});

// ---------------------------------------------------------------------------
// Sync logic
// ---------------------------------------------------------------------------

/**
 * Fetches new submissions from all configured platforms and stores them.
 *
 * LeetCode uses the submissionCalendar path (full year, count-only).
 * Codeforces combines API submissions with DOM-scraped submissions staged by
 * the content script before grouping and storage.
 *
 * @returns {Promise<{ ok: boolean, errors: string[] }>}
 */
async function runSync() {
  const errors = [];
  const syncAttemptTime = Date.now();
  try {
    const settings = await getSettings();

    // --- LeetCode: calendar-based sync ---
    const lcHandleTrim = (settings.leetcodeHandle ?? "").trim();
    if (lcHandleTrim) {
      const { calendar, error, userNotFound } = await getLeetCodeSubmissionCalendar(
        lcHandleTrim
      );
      if (error) {
        errors.push(`${PLATFORMS.LEETCODE}: ${error}`);
      } else if (userNotFound) {
        await setLeetCodeCalendar({});
        await setLeetCodeCalendarMeta({ handle: lcHandleTrim, userFound: false });
      } else {
        await setLeetCodeCalendar(calendarToDateCounts(calendar ?? {}));
        await setLeetCodeCalendarMeta({ handle: lcHandleTrim, userFound: true });
        await setLastSync(PLATFORMS.LEETCODE, Date.now());
      }
    } else {
      await setLeetCodeCalendar({});
      await setLeetCodeCalendarMeta({ handle: "", userFound: true });
    }

    if (settings.codeforcesHandle) {
      const cfState = await getCfIncrementalSync();
      let cfLastSyncTimestamp = cfState.lastSyncTimestamp;
      if (cfState.handle !== settings.codeforcesHandle) {
        cfLastSyncTimestamp = 0;
      }
      const cfDomSubmissions = await getCodeforcesDomSubmissionsForHandle(
        settings.codeforcesHandle
      );

      const { submissionsByDate, error, cfMaxOkCreationSec } = await fetchSubmissions(
        PLATFORMS.CODEFORCES,
        settings.codeforcesHandle,
        {
          cfLastSyncSec: cfLastSyncTimestamp,
          cfDomSubmissions,
        }
      );
      if (error) {
        errors.push(`${PLATFORMS.CODEFORCES}: ${error}`);
      } else {
        await bulkMergeSubmissions(PLATFORMS.CODEFORCES, submissionsByDate);
        await clearCodeforcesDomSubmissionsForHandle(settings.codeforcesHandle);
        await setLastSync(PLATFORMS.CODEFORCES, Date.now());
        await setCfIncrementalSync({
          handle: settings.codeforcesHandle,
          lastSyncTimestamp: Math.max(cfLastSyncTimestamp, cfMaxOkCreationSec || 0),
        });
      }
    }

    // Persist current ISO-week snapshot without recomputing historical weeks.
    try {
      const submissionsByDate = filterSubmissionsByPlatformHandles(
        await getAllSubmissions(),
        settings
      );
      const lcCounts = await getLeetCodeDateCountsForSettings(settings);
      const mergedSubmissions = mergeCalendarIntoSubmissions(
        submissionsByDate,
        lcCounts
      );
      await updateWeeklyStats(mergedSubmissions);
    } catch (err) {
      errors.push(`weekly-stats: ${err.message}`);
    }
  } catch (err) {
    errors.push(err?.message ?? "Unexpected sync error");
  }

  await setSyncStatus({
    lastAttempt: syncAttemptTime,
    errors,
  });

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Message handler (popup/options/dashboard → background)
// ---------------------------------------------------------------------------

/**
 * Accept only messages from this extension's own contexts.
 *
 * @param {browser.runtime.MessageSender} sender
 * @returns {boolean}
 */
function isTrustedInternalSender(sender) {
  if (sender?.id) {
    return sender.id === browser.runtime.id;
  }

  if (isCodeforcesSubmissionsPageSender(sender)) {
    return true;
  }

  const extensionOrigin = browser.runtime.getURL("");
  return typeof sender?.url === "string" && sender.url.startsWith(extensionOrigin);
}

/**
 * @param {browser.runtime.MessageSender} sender
 * @returns {boolean}
 */
function isCodeforcesSubmissionsPageSender(sender) {
  const url = typeof sender?.url === "string" ? sender.url : sender?.tab?.url;
  return typeof url === "string" && /^https:\/\/codeforces\.com\/submissions\/[^/?#]+/.test(url);
}

/**
 * @param {unknown} payload
 * @returns {{ handle: string, submissions: Array<object> }}
 */
function extractCfDomPayload(payload) {
  const rawHandle =
    payload && typeof payload === "object" && typeof payload.handle === "string"
      ? payload.handle
      : "";
  const rawSubmissions =
    payload && typeof payload === "object" && Array.isArray(payload.submissions)
      ? payload.submissions
      : [];

  const submissions = rawSubmissions
    .map((submission) => normalizeCodeforcesDomSubmission(submission))
    .filter(Boolean);

  return {
    handle: rawHandle.trim(),
    submissions,
  };
}

/**
 * @param {unknown} payload
 * @returns {Promise<{ ok: boolean, accepted: number, handle?: string, error?: string }>}
 */
async function handleCfDomSubmissionsMessage(payload) {
  const { handle, submissions } = extractCfDomPayload(payload);
  if (!handle) {
    return { ok: false, accepted: 0, error: "Missing Codeforces handle." };
  }
  if (submissions.length === 0) {
    return { ok: true, accepted: 0, handle };
  }

  const staged = await stageCodeforcesDomSubmissions(handle, submissions);
  return { ok: true, accepted: submissions.length, handle, buffered: staged.length };
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isTrustedInternalSender(sender)) {
    sendResponse({ ok: false, error: "Unauthorized message sender." });
    return false;
  }

  if (!message || typeof message !== "object" || typeof message.type !== "string") {
    sendResponse({ ok: false, error: "Invalid message payload." });
    return false;
  }

  if (message.type === "sync") {
    runSync()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, errors: [err.message] }));
    return true; 
  }

  if (message.type === "getStats") {
    buildStatsResponse()
      .then((payload) => sendResponse(payload))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "cfDomSubmissions") {
    if (!isCodeforcesSubmissionsPageSender(sender)) {
      sendResponse({ ok: false, error: "Unsupported Codeforces sender URL." });
      return false;
    }

    handleCfDomSubmissionsMessage(message.payload)
      .then((payload) => sendResponse(payload))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  sendResponse({ ok: false, error: `Unsupported message type: ${message.type}` });
  return false;
});

// ---------------------------------------------------------------------------
// Stats builder
// ---------------------------------------------------------------------------

/**
 * Produces an in-memory view of submissionsByDate where the LeetCode arrays
 * are sized according to calendar counts rather than stored objects.
 *
 * This lets computeStats() and calculateStreak() (which count .length on
 * platform arrays) work correctly without any changes to those modules.
 * The merge is ephemeral — nothing is written to storage.
 *
 * @param {Object.<string, Object.<string, Array>>} submissionsByDate
 * @param {Object.<string, number>} lcCalendar  { [dateKey]: count }
 * @returns {Object.<string, Object.<string, Array>>}
 */
function mergeCalendarIntoSubmissions(submissionsByDate, lcCalendar) {
  if (!lcCalendar || Object.keys(lcCalendar).length === 0) {
    return submissionsByDate;
  }

  const merged = {};

  for (const [dateKey, bucket] of Object.entries(submissionsByDate)) {
    merged[dateKey] = { ...bucket };
  }

  for (const [dateKey, count] of Object.entries(lcCalendar)) {
    if (!merged[dateKey]) {
      merged[dateKey] = { [PLATFORMS.CODEFORCES]: [], [PLATFORMS.LEETCODE]: [] };
    }

    merged[dateKey] = {
      ...merged[dateKey],
      [PLATFORMS.LEETCODE]: Array.from({ length: count }),
    };
  }

  return merged;
}


async function buildStatsResponse() {
  const [submissionsByDate, settings, syncStatus] = await Promise.all([
    getAllSubmissions(),
    getSettings(),
    getSyncStatus(),
  ]);

  const filtered = filterSubmissionsByPlatformHandles(submissionsByDate, settings);
  const lcCounts = await getLeetCodeDateCountsForSettings(settings);
  const mergedSubmissions = mergeCalendarIntoSubmissions(filtered, lcCounts);

  const stats = computeStats(mergedSubmissions, settings);
  const streak = calculateStreak(mergedSubmissions, settings);

  const leetCodeUserNotFound = await isLeetCodeUserNotFoundForSettings(settings);

  const lastSync = {
    [PLATFORMS.CODEFORCES]: await getLastSync(PLATFORMS.CODEFORCES),
    [PLATFORMS.LEETCODE]: await getLastSync(PLATFORMS.LEETCODE),
  };

  return { stats, streak, lastSync, settings, syncStatus, leetCodeUserNotFound };
}
