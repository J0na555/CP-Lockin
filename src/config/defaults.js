const DEFAULTS = {
  weeklyGoal: 25,
  dailyMinGoal: 1,
  requireBothSitesForStreak: false,
  syncIntervalMinutes: 30,
  codeforcesHandle: "",
  leetcodeHandle: "",
};

const PLATFORMS = {
  CODEFORCES: "codeforces",
  LEETCODE: "leetcode",
};

const STORAGE_KEYS = {
  SETTINGS: "settings",
  SUBMISSIONS: "submissions",
  LAST_SYNC: "lastSync",
  // Per-day LeetCode submission counts sourced from submissionCalendar.
  // Shape: { [dateKey: "YYYY-MM-DD"]: number }
  LEETCODE_CALENDAR: "leetcodeCalendar",
  // Weekly solved snapshots keyed by ISO week (YYYY-W##).
  // Shape: { [weekKey: "YYYY-W##"]: { lc: number, cf: number, total: number } }
  WEEKLY_STATS: "weeklyStats",
  // Tracks which ISO week was last updated by sync.
  LAST_WEEK_KEY: "lastWeekKey",
};

const SYNC_ALARM_NAME = "cp-lockin-sync";
