/**
 * Popup script — handles UI rendering and user interactions.
 * Communicates with the background service worker via browser.runtime.sendMessage.
 */

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const elTodayCount = document.getElementById("today-count");
const elStreakCount = document.getElementById("streak-count");
const elWeeklySolved = document.getElementById("weekly-solved");
const elWeeklyGoal = document.getElementById("weekly-goal");
const elWeeklyBar = document.getElementById("weekly-progress-bar");
const elWeeklyPercent = document.getElementById("weekly-percent");
const elDailyBadge = document.getElementById("daily-goal-badge");
const elSyncStatus = document.getElementById("sync-status");
const elNoticeNoHandle = document.getElementById("notice-no-handle");
const btnSync = document.getElementById("btn-sync");
const btnSettings = document.getElementById("btn-settings");

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderStats(payload) {
  const { stats, streak, lastSync, settings } = payload;

  // Today
  elTodayCount.textContent = stats.todayCount;

  // Daily goal badge
  elDailyBadge.classList.remove("hidden", "badge--success", "badge--pending");
  if (stats.dailyGoalMet) {
    elDailyBadge.textContent = "goal met ✓";
    elDailyBadge.classList.add("badge--success");
  } else {
    elDailyBadge.textContent = `need ${settings.dailyMinGoal}`;
    elDailyBadge.classList.add("badge--pending");
  }

  // Streak
  elStreakCount.textContent = streak.current;

  // Weekly progress
  const { solved, goal, percentage } = stats.weeklyProgress;
  elWeeklySolved.textContent = solved;
  elWeeklyGoal.textContent = goal;
  elWeeklyBar.style.width = `${percentage}%`;
  elWeeklyPercent.textContent = `${percentage}%`;
  if (percentage >= 100) {
    elWeeklyBar.classList.add("complete");
  } else {
    elWeeklyBar.classList.remove("complete");
  }

  // Last sync — show the most recent across platforms
  const times = Object.values(lastSync).filter(Boolean);
  if (times.length > 0) {
    const latest = Math.max(...times);
    elSyncStatus.textContent = `Last synced: ${formatRelativeTime(latest)}`;
  } else {
    elSyncStatus.textContent = "Never synced";
  }

  // No-handle notice
  const hasHandle = settings.codeforcesHandle || settings.leetcodeHandle;
  elNoticeNoHandle.classList.toggle("hidden", Boolean(hasHandle));
}

/**
 * Formats a Unix timestamp (ms) as a human-readable relative string.
 * @param {number} ms
 * @returns {string}
 */
function formatRelativeTime(ms) {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function setLoadingState(loading) {
  btnSync.disabled = loading;
  btnSync.classList.toggle("spinning", loading);
}

function showError(message) {
  // Reuse the no-handle notice element for transient errors
  elNoticeNoHandle.classList.remove("hidden");
  elNoticeNoHandle.className = "notice notice--error";
  elNoticeNoHandle.textContent = message;
  setTimeout(() => {
    elNoticeNoHandle.className = "notice notice--warn hidden";
    elNoticeNoHandle.textContent = "";
  }, 4000);
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadStats() {
  setLoadingState(true);
  try {
    const payload = await browser.runtime.sendMessage({ type: "getStats" });
    if (payload.error) {
      showError(payload.error);
    } else {
      renderStats(payload);
    }
  } catch (err) {
    showError("Could not load stats. Try again.");
    console.error(err);
  } finally {
    setLoadingState(false);
  }
}

async function triggerSync() {
  setLoadingState(true);
  elSyncStatus.textContent = "Syncing…";
  try {
    const result = await browser.runtime.sendMessage({ type: "sync" });
    if (!result.ok && result.errors.length > 0) {
      showError(result.errors.join(" | "));
    }
    // Reload stats after sync
    await loadStats();
  } catch (err) {
    showError("Sync failed. Check your handles in Settings.");
    console.error(err);
    setLoadingState(false);
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

btnSync.addEventListener("click", triggerSync);

btnSettings.addEventListener("click", () => {
  browser.runtime.openOptionsPage();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

loadStats();
