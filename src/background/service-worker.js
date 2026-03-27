/**
 * Background service worker — orchestrates syncing and responds to popup messages.
 *
 * Message API (browser.runtime.sendMessage):
 *   { type: "sync" }    → triggers a full sync, returns { ok: true, errors: [] }
 *   { type: "getStats" } → returns { stats, streak, lastSync, settings }
 */

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
 * Codeforces uses the legacy individual-submission path.
 *
 * @returns {Promise<{ ok: boolean, errors: string[] }>}
 */
async function runSync() {
  const settings = await getSettings();
  const errors = [];

  // --- LeetCode: calendar-based sync ---
  if (settings.leetcodeHandle) {
    const { calendar, error } = await getLeetCodeSubmissionCalendar(
      settings.leetcodeHandle
    );
    if (error) {
      errors.push(`${PLATFORMS.LEETCODE}: ${error}`);
    } else if (calendar) {
      await setLeetCodeCalendar(calendarToDateCounts(calendar));
      await setLastSync(PLATFORMS.LEETCODE, Date.now());
    }
  }

  // --- Codeforces: individual submission path ----
  if (settings.codeforcesHandle) {
    const { submissionsByDate, error } = await fetchSubmissions(
      PLATFORMS.CODEFORCES,
      settings.codeforcesHandle
    );
    if (error) {
      errors.push(`${PLATFORMS.CODEFORCES}: ${error}`);
    } else {
      await bulkMergeSubmissions(PLATFORMS.CODEFORCES, submissionsByDate);
      await setLastSync(PLATFORMS.CODEFORCES, Date.now());
    }
  }

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
  // Most extension-context messages provide sender.id.
  if (sender?.id) {
    return sender.id === browser.runtime.id;
  }

  // Fallback for contexts where id may be omitted but URL is available.
  const extensionOrigin = browser.runtime.getURL("");
  return typeof sender?.url === "string" && sender.url.startsWith(extensionOrigin);
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
    return true; // keep channel open for async response
  }

  if (message.type === "getStats") {
    buildStatsResponse()
      .then((payload) => sendResponse(payload))
      .catch((err) => sendResponse({ error: err.message }));
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
    // Synthetic placeholder array sized to the calendar count. Only .length
    // is ever read by the stats/streak services — contents are irrelevant.
    merged[dateKey] = {
      ...merged[dateKey],
      [PLATFORMS.LEETCODE]: Array.from({ length: count }),
    };
  }

  return merged;
}

/**
 * Reads storage and computes the full stats payload for the popup.
 */
async function buildStatsResponse() {
  const [submissionsByDate, settings, lcCalendar] = await Promise.all([
    getAllSubmissions(),
    getSettings(),
    getLeetCodeCalendar(),
  ]);

  const mergedSubmissions = mergeCalendarIntoSubmissions(
    submissionsByDate,
    lcCalendar
  );

  const stats = computeStats(mergedSubmissions, settings);
  const streak = calculateStreak(mergedSubmissions, settings);

  const lastSync = {
    [PLATFORMS.CODEFORCES]: await getLastSync(PLATFORMS.CODEFORCES),
    [PLATFORMS.LEETCODE]: await getLastSync(PLATFORMS.LEETCODE),
  };

  return { stats, streak, lastSync, settings };
}
