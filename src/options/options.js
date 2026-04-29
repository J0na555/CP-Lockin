const form = document.getElementById("settings-form");
const elCfHandle = document.getElementById("cf-handle");
const elLcHandle = document.getElementById("lc-handle");
const elWeeklyGoal = document.getElementById("weekly-goal");
const elDailyGoal = document.getElementById("daily-goal");
const elRequireBothSitesForStreak = document.getElementById("require-both-sites-streak");
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
    requireBothSitesForStreak: DEFAULTS.requireBothSitesForStreak,
  };

  elCfHandle.value = settings.codeforcesHandle ?? "";
  elLcHandle.value = settings.leetcodeHandle ?? "";
  elWeeklyGoal.value = settings.weeklyGoal ?? DEFAULTS.weeklyGoal;
  elDailyGoal.value = settings.dailyMinGoal ?? DEFAULTS.dailyMinGoal;
  elRequireBothSitesForStreak.checked = settings.requireBothSitesForStreak ?? DEFAULTS.requireBothSitesForStreak;
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

  const newCf = elCfHandle.value.trim();
  const newLc = elLcHandle.value.trim();

  const settings = {
    codeforcesHandle: newCf,
    leetcodeHandle: newLc,
    weeklyGoal,
    dailyMinGoal,
    requireBothSitesForStreak: elRequireBothSitesForStreak.checked,
  };

  try {
    const existing = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
    const prev = existing[STORAGE_KEYS.SETTINGS] ?? {};
    const oldCf = (prev.codeforcesHandle ?? "").trim();
    const oldLc = (prev.leetcodeHandle ?? "").trim();

    const cfConflict = oldCf !== "" && newCf !== oldCf;
    const lcConflict = oldLc !== "" && newLc !== oldLc;

    if (cfConflict || lcConflict) {
      const reset = window.confirm(
        "You changed a platform handle. Reset data or keep existing?\n\n" +
          "OK — Reset: clear all tracked submissions and sync state.\n" +
          "Cancel — Keep: keep existing data tagged with the previous handle(s)."
      );
      if (reset) {
        await clearAllTrackingData({
          codeforcesHandle: newCf,
          leetcodeHandle: newLc,
        });
      } else {
        if (lcConflict) {
          await archiveCurrentLeetCodeCalendar(oldLc);
          await setLeetCodeCalendarMeta({ handle: newLc, userFound: true });
        }
        await tagSubmissionsWithHandles({
          codeforcesHandle: cfConflict ? oldCf : "",
          leetcodeHandle: lcConflict ? oldLc : "",
        });
      }
    }

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
