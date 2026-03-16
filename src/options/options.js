/**
 * Options page script — loads and saves extension settings.
 */

const form = document.getElementById("settings-form");
const elCfHandle = document.getElementById("cf-handle");
const elLcHandle = document.getElementById("lc-handle");
const elWeeklyGoal = document.getElementById("weekly-goal");
const elDailyGoal = document.getElementById("daily-goal");
const elSaveStatus = document.getElementById("save-status");

// ---------------------------------------------------------------------------
// Load current settings
// ---------------------------------------------------------------------------

async function loadSettings() {
  const result = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
  const settings = result[STORAGE_KEYS.SETTINGS] ?? {
    codeforcesHandle: DEFAULTS.codeforcesHandle,
    leetcodeHandle: DEFAULTS.leetcodeHandle,
    weeklyGoal: DEFAULTS.weeklyGoal,
    dailyMinGoal: DEFAULTS.dailyMinGoal,
  };

  elCfHandle.value = settings.codeforcesHandle ?? "";
  elLcHandle.value = settings.leetcodeHandle ?? "";
  elWeeklyGoal.value = settings.weeklyGoal ?? DEFAULTS.weeklyGoal;
  elDailyGoal.value = settings.dailyMinGoal ?? DEFAULTS.dailyMinGoal;
}

// ---------------------------------------------------------------------------
// Save settings
// ---------------------------------------------------------------------------

async function saveSettings(e) {
  e.preventDefault();

  const weeklyGoal = parseInt(elWeeklyGoal.value, 10);
  const dailyMinGoal = parseInt(elDailyGoal.value, 10);

  if (isNaN(weeklyGoal) || weeklyGoal < 1) {
    showStatus("Weekly goal must be at least 1.", false);
    return;
  }

  if (isNaN(dailyMinGoal) || dailyMinGoal < 1) {
    showStatus("Daily minimum must be at least 1.", false);
    return;
  }

  const settings = {
    codeforcesHandle: elCfHandle.value.trim(),
    leetcodeHandle: elLcHandle.value.trim(),
    weeklyGoal,
    dailyMinGoal,
  };

  try {
    const existing = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
    await browser.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: {
        ...(existing[STORAGE_KEYS.SETTINGS] ?? {}),
        ...settings,
      },
    });
    showStatus("Settings saved.", true);
  } catch (err) {
    showStatus("Failed to save. Try again.", false);
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------

let statusTimer = null;

function showStatus(message, success) {
  elSaveStatus.textContent = message;
  elSaveStatus.className = `save-status ${success ? "save-status--success" : "save-status--error"}`;
  elSaveStatus.classList.remove("hidden");

  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    elSaveStatus.classList.add("hidden");
  }, 3000);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

form.addEventListener("submit", saveSettings);
loadSettings().catch(console.error);
