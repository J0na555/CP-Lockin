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
 * @returns {Promise<{ ok: boolean, errors: string[] }>}
 */
async function runSync() {
  const settings = await getSettings();
  const errors = [];

  const platforms = [
    { id: PLATFORMS.CODEFORCES, handle: settings.codeforcesHandle },
    { id: PLATFORMS.LEETCODE, handle: settings.leetcodeHandle },
  ];

  for (const { id, handle } of platforms) {
    if (!handle) continue;

    const { submissionsByDate, error } = await fetchSubmissions(id, handle);

    if (error) {
      errors.push(`${id}: ${error}`);
      continue;
    }

    await bulkMergeSubmissions(submissionsByDate);
    await setLastSync(id, Date.now());
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Message handler (popup → background)
// ---------------------------------------------------------------------------

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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

  return false;
});

// ---------------------------------------------------------------------------
// Stats builder
// ---------------------------------------------------------------------------

/**
 * Reads storage and computes the full stats payload for the popup.
 */
async function buildStatsResponse() {
  const [submissionsByDate, settings] = await Promise.all([
    getAllSubmissions(),
    getSettings(),
  ]);

  const stats = computeStats(submissionsByDate, settings);
  const streak = calculateStreak(submissionsByDate, settings.dailyMinGoal);

  const lastSync = {
    [PLATFORMS.CODEFORCES]: await getLastSync(PLATFORMS.CODEFORCES),
    [PLATFORMS.LEETCODE]: await getLastSync(PLATFORMS.LEETCODE),
  };

  return { stats, streak, lastSync, settings };
}
