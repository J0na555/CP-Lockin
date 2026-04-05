/**
 * dashboard.js — pure rendering; no data-fetching or date logic.
 * Depends on: utils/dateUtils.js, services/trackerService.js
 */

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS   = ["Mon","","Wed","","Fri","","Sun"];

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

let tooltipEl = null;

function showTooltip(e, dateKey, lc, cf) {
  if (!tooltipEl) return;
  tooltipEl.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = dateKey;
  tooltipEl.append(title, document.createElement("br"));
  tooltipEl.appendChild(document.createTextNode(`LeetCode: ${lc}`));
  tooltipEl.append(document.createElement("br"));
  tooltipEl.appendChild(document.createTextNode(`Codeforces: ${cf}`));
  tooltipEl.removeAttribute("hidden");
  moveTooltip(e);
}

function moveTooltip(e) {
  if (!tooltipEl || tooltipEl.hasAttribute("hidden")) return;
  const offsetX = 14;
  const offsetY = 14;
  const tw = tooltipEl.offsetWidth;
  const th = tooltipEl.offsetHeight;
  let x = e.clientX + offsetX;
  let y = e.clientY + offsetY;
  if (x + tw > window.innerWidth  - 8) x = e.clientX - tw - offsetX;
  if (y + th > window.innerHeight - 8) y = e.clientY - th - offsetY;
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top  = `${y}px`;
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.setAttribute("hidden", "");
}

function formatRelativeTime(ms) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function renderSyncError(syncStatus) {
  const banner = document.getElementById("dashboard-sync-error");
  if (!banner) return;

  const errors = syncStatus?.errors ?? [];
  if (errors.length === 0) {
    banner.classList.add("hidden");
    banner.textContent = "";
    return;
  }

  const lastAttemptText = syncStatus?.lastAttempt
    ? ` Last attempt: ${formatRelativeTime(syncStatus.lastAttempt)}.`
    : "";

  banner.textContent = `Latest sync failed, so dashboard data may be stale. ${errors.join(" | ")}.${lastAttemptText}`;
  banner.classList.remove("hidden");
}

function renderLeetCodeUserNotFound(show) {
  const banner = document.getElementById("dashboard-lc-not-found");
  if (!banner) return;
  if (!show) {
    banner.classList.add("hidden");
    banner.textContent = "";
    return;
  }
  banner.textContent = "User not found";
  banner.classList.remove("hidden");
}

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

function getCellClass(lc, cf) {
  if (lc > 0 && cf > 0) return "both";
  if (lc > 0) return "leetcode";
  if (cf > 0) return "codeforces";
  return "empty";
}

function getIntensity(total) {
  if (total >= 6) return 3;
  if (total >= 3) return 2;
  if (total >= 1) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Render: day labels (Mon / Wed / Fri / Sun)
// ---------------------------------------------------------------------------

function renderDayLabels() {
  const container = document.getElementById("day-labels");
  if (!container) return;
  container.replaceChildren();
  DAY_LABELS.forEach((label) => {
    const span = document.createElement("span");
    span.textContent = label;
    container.appendChild(span);
  });
}

// ---------------------------------------------------------------------------
// Render: month labels row above the grid
// ---------------------------------------------------------------------------

function renderMonthLabels(heatmapRange) {
  const container = document.getElementById("heatmap-months");
  if (!container) return;
  container.replaceChildren();

  const { dates, startKey } = heatmapRange;
  const totalWeeks = getWeekIndex(dates[dates.length - 1], startKey) + 1;
  container.style.gridTemplateColumns = `repeat(${totalWeeks}, var(--cell-size))`;


  let lastLabelCol = -2;
  for (const dateKey of dates) {
    const date = parseDateKey(dateKey);
    if (date.getDate() !== 1) continue;

    const weekIdx = getWeekIndex(dateKey, startKey);

    // Guard against two labels landing in adjacent columns (can happen when
    // the 1st falls on Sunday and the next month's 1st is only ~4 weeks away).
    if (weekIdx <= lastLabelCol + 1) continue;

    const span = document.createElement("span");
    span.className = "month-label";
    span.style.gridColumn = String(weekIdx + 1);
    span.textContent = MONTH_NAMES[date.getMonth()];
    container.appendChild(span);
    lastLabelCol = weekIdx;
  }
}

// ---------------------------------------------------------------------------
// Render: heatmap grid
// ---------------------------------------------------------------------------

function renderHeatmap(dailyData, heatmapRange) {
  const grid = document.getElementById("heatmap-grid");
  if (!grid) return;
  grid.replaceChildren();

  const { dates, startKey } = heatmapRange;
  const totalWeeks = getWeekIndex(dates[dates.length - 1], startKey) + 1;
  grid.style.gridTemplateColumns = `repeat(${totalWeeks}, var(--cell-size))`;

  for (const dateKey of dates) {
    const entry = dailyData[dateKey] ?? { leetcode: 0, codeforces: 0 };
    const lc    = entry.leetcode   ?? 0;
    const cf    = entry.codeforces ?? 0;
    const total = lc + cf;

    const cell = document.createElement("div");
    cell.className = `heatmap-cell ${getCellClass(lc, cf)} intensity-${getIntensity(total)}`;
    cell.style.gridRow    = String(getDayOfWeek(dateKey) + 1);
    cell.style.gridColumn = String(getWeekIndex(dateKey, startKey) + 1);

    cell.addEventListener("mouseenter", (e) => showTooltip(e, dateKey, lc, cf));
    cell.addEventListener("mousemove",  moveTooltip);
    cell.addEventListener("mouseleave", hideTooltip);

    grid.appendChild(cell);
  }
}

// ---------------------------------------------------------------------------
// Render: summary stat cards
// ---------------------------------------------------------------------------

function renderSummaryStats(dailyData, heatmapRange) {
  const { dates } = heatmapRange;
  let activeDays = 0;
  let bothDays   = 0;
  let totalAccepted = 0;

  for (const dateKey of dates) {
    const d = dailyData[dateKey];
    if (!d) continue;
    const lc = d.leetcode   ?? 0;
    const cf = d.codeforces ?? 0;
    const total = lc + cf;
    totalAccepted += total;
    if (total > 0) activeDays++;
    if (lc > 0 && cf > 0) bothDays++;
  }

  document.getElementById("stat-active-days").textContent = activeDays;
  document.getElementById("stat-both-days").textContent = bothDays;
  document.getElementById("stat-total-solved").textContent = totalAccepted;
}

function getCurrentWeekFromDailyData(dailyData) {
  const weekKeys = getCalendarWeekDateKeys();
  let lc = 0;
  let cf = 0;
  for (const k of weekKeys) {
    const d = dailyData[k];
    if (!d) continue;
    lc += d.leetcode ?? 0;
    cf += d.codeforces ?? 0;
  }
  return { lc, cf, total: lc + cf };
}

function getWeekDateKeysByOffset(offsetWeeks, includeFullWeek = true) {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const dow = (base.getDay() + 6) % 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - dow - offsetWeeks * 7);

  const end = new Date(monday);
  end.setDate(monday.getDate() + 6);

  const upperBound = includeFullWeek ? end : new Date();
  upperBound.setHours(0, 0, 0, 0);

  const keys = [];
  const cursor = new Date(monday);
  while (cursor <= end && cursor <= upperBound) {
    keys.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function getWeekFromDailyData(dailyData, offsetWeeks) {
  const includeFullWeek = offsetWeeks > 0;
  const weekKeys = getWeekDateKeysByOffset(offsetWeeks, includeFullWeek);
  let lc = 0;
  let cf = 0;
  for (const k of weekKeys) {
    const d = dailyData[k];
    if (!d) continue;
    lc += d.leetcode ?? 0;
    cf += d.codeforces ?? 0;
  }
  return { lc, cf, total: lc + cf };
}

async function renderWeeklyProgress(dailyData) {
  const weeklyStats = await getWeeklyStats();
  const currentWeekKey = getISOWeekKey(new Date());
  const previousWeekKey = getPreviousISOWeekKey(new Date());

  const weeklyGoal = Number(window.__dashboardWeeklyGoal) > 0
    ? Number(window.__dashboardWeeklyGoal)
    : DEFAULTS.weeklyGoal;

  const currentWeek = weeklyStats[currentWeekKey] ?? getCurrentWeekFromDailyData(dailyData);
  // Fallback is critical for existing users who have last week data in submissions
  // but no persisted weekly snapshot from older extension versions.
  const previousWeek = weeklyStats[previousWeekKey] ?? getWeekFromDailyData(dailyData, 1);

  const weekViews = {
    current: {
      key: currentWeekKey,
      title: "This Week",
      stats: currentWeek,
    },
    last: {
      key: previousWeekKey,
      title: "Last Week",
      stats: previousWeek,
    },
  };

  const weeklyGoalEl = document.getElementById("weekly-progress-goal");
  const weeklyProgressPercentEl = document.getElementById("weekly-progress-percent");
  const weeklyProgressFillEl = document.getElementById("weekly-progress-fill");
  const weeklyTitleEl = document.getElementById("weekly-progress-title");
  const weeklyContextEl = document.getElementById("weekly-progress-total-context");
  const currentBtn = document.getElementById("week-toggle-current");
  const lastBtn = document.getElementById("week-toggle-last");

  if (weeklyGoalEl) weeklyGoalEl.textContent = String(weeklyGoal);

  function applyWeekView(viewKey) {
    const view = weekViews[viewKey];
    const weekNo = view.key.split("-W")[1] ?? "--";
    const weekProgressRatio = weeklyGoal > 0 ? Math.min(view.stats.total / weeklyGoal, 1) : 0;
    const weekProgressPercent = Math.round(weekProgressRatio * 100);

    if (weeklyTitleEl) weeklyTitleEl.textContent = `${view.title} (Week ${weekNo})`;
    if (weeklyContextEl) weeklyContextEl.textContent = `${view.stats.total} / ${weeklyGoal}`;
    document.getElementById("stat-week-lc").textContent = view.stats.lc;
    document.getElementById("stat-week-cf").textContent = view.stats.cf;
    document.getElementById("stat-total-all").textContent = view.stats.total;
    if (weeklyProgressPercentEl) weeklyProgressPercentEl.textContent = `${weekProgressPercent}% complete`;
    if (weeklyProgressFillEl) weeklyProgressFillEl.style.width = `${weekProgressPercent}%`;

    const isCurrent = viewKey === "current";
    currentBtn?.classList.toggle("is-active", isCurrent);
    lastBtn?.classList.toggle("is-active", !isCurrent);
    currentBtn?.setAttribute("aria-selected", String(isCurrent));
    lastBtn?.setAttribute("aria-selected", String(!isCurrent));
  }

  currentBtn?.addEventListener("click", () => applyWeekView("current"));
  lastBtn?.addEventListener("click", () => applyWeekView("last"));
  applyWeekView("current");
}

async function loadWeeklyGoalSetting() {
  try {
    const result = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
    const settings = result[STORAGE_KEYS.SETTINGS] ?? {};
    const parsedGoal = parseInt(settings.weeklyGoal, 10);
    window.__dashboardWeeklyGoal = Number.isFinite(parsedGoal) && parsedGoal > 0
      ? parsedGoal
      : DEFAULTS.weeklyGoal;
  } catch (err) {
    console.error("Failed to load weekly goal for dashboard:", err);
    window.__dashboardWeeklyGoal = DEFAULTS.weeklyGoal;
  }
}

// ---------------------------------------------------------------------------
// Weekly aggregates (same week columns as heatmap)
// ---------------------------------------------------------------------------

function aggregateWeeklyCounts(dailyData, heatmapRange) {
  const { dates, startKey } = heatmapRange;
  const weekCount = getWeekIndex(dates[dates.length - 1], startKey) + 1;
  const lc = new Array(weekCount).fill(0);
  const cf = new Array(weekCount).fill(0);

  for (const dateKey of dates) {
    const wi = getWeekIndex(dateKey, startKey);
    const d  = dailyData[dateKey];
    if (!d) continue;
    lc[wi] += d.leetcode   ?? 0;
    cf[wi] += d.codeforces ?? 0;
  }

  return { lc, cf, weekCount };
}

const SVG_NS = "http://www.w3.org/2000/svg";

function renderWeeklyLineChart(dailyData, heatmapRange) {
  const container = document.getElementById("weekly-chart");
  if (!container) return;

  const { lc, cf, weekCount } = aggregateWeeklyCounts(dailyData, heatmapRange);
  if (weekCount < 1) {
    container.replaceChildren();
    return;
  }

  const W = 720;
  const H = 220;
  const padL = 40;
  const padR = 14;
  const padT = 14;
  const padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  let maxY = 1;
  for (let i = 0; i < weekCount; i++) {
    maxY = Math.max(maxY, lc[i] + cf[i]);
  }

  const xAt = (i) =>
    padL + (weekCount === 1 ? innerW / 2 : (i / (weekCount - 1)) * innerW);
  const yAt = (v) => padT + innerH - (v / maxY) * innerH;

  const dLine = (arr) =>
    arr
      .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`)
      .join(" ");

  let pathCfArea = `M ${xAt(0).toFixed(1)} ${(padT + innerH).toFixed(1)}`;
  for (let i = 0; i < weekCount; i++) {
    pathCfArea += ` L ${xAt(i).toFixed(1)} ${yAt(cf[i]).toFixed(1)}`;
  }
  pathCfArea += ` L ${xAt(weekCount - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  let pathLcArea = `M ${xAt(0).toFixed(1)} ${yAt(cf[0] + lc[0]).toFixed(1)}`;
  for (let i = 1; i < weekCount; i++) {
    pathLcArea += ` L ${xAt(i).toFixed(1)} ${yAt(cf[i] + lc[i]).toFixed(1)}`;
  }
  for (let i = weekCount - 1; i >= 0; i--) {
    pathLcArea += ` L ${xAt(i).toFixed(1)} ${yAt(cf[i]).toFixed(1)}`;
  }
  pathLcArea += " Z";

  const ticks = [...new Set([0, Math.ceil(maxY / 2), maxY])].sort((a, b) => a - b);
  const ariaLabel = `Accepted submissions per week over ${weekCount} weeks. LeetCode and Codeforces.`;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "weekly-chart-svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", ariaLabel);

  for (const t of ticks) {
    const yy = yAt(t);
    const gridLine = document.createElementNS(SVG_NS, "line");
    gridLine.setAttribute("class", "chart-grid");
    gridLine.setAttribute("x1", String(padL));
    gridLine.setAttribute("y1", yy.toFixed(1));
    gridLine.setAttribute("x2", String(padL + innerW));
    gridLine.setAttribute("y2", yy.toFixed(1));
    svg.appendChild(gridLine);

    const tickLabel = document.createElementNS(SVG_NS, "text");
    tickLabel.setAttribute("class", "chart-axis");
    tickLabel.setAttribute("x", String(padL - 6));
    tickLabel.setAttribute("y", String(yy + 4));
    tickLabel.setAttribute("text-anchor", "end");
    tickLabel.textContent = String(t);
    svg.appendChild(tickLabel);
  }

  function appendPath(className, d, fillNone = false) {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("class", className);
    p.setAttribute("d", d);
    if (fillNone) p.setAttribute("fill", "none");
    svg.appendChild(p);
  }

  appendPath("chart-area chart-area-cf", pathCfArea);
  appendPath("chart-area chart-area-lc", pathLcArea);
  appendPath("chart-line chart-line-cf", dLine(cf), true);
  appendPath("chart-line chart-line-lc", dLine(lc), true);

  const axisX = document.createElementNS(SVG_NS, "text");
  axisX.setAttribute("class", "chart-axis chart-axis-x");
  axisX.setAttribute("x", String(padL + innerW / 2));
  axisX.setAttribute("y", String(H - 8));
  axisX.setAttribute("text-anchor", "middle");
  axisX.textContent = "Weeks (older → newer)";
  svg.appendChild(axisX);

  container.replaceChildren(svg);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  tooltipEl = document.getElementById("tooltip");

  await loadWeeklyGoalSetting();

  const heatmapRange = getHeatmapRange(52);
  const [activity, syncStatus] = await Promise.all([
    getDailyActivity(),
    getDashboardSyncStatus(),
  ]);
  const dailyData = activity.daily;

  renderLeetCodeUserNotFound(activity.leetCodeUserNotFound);
  renderSyncError(syncStatus);

  renderDayLabels();
  renderMonthLabels(heatmapRange);
  renderHeatmap(dailyData, heatmapRange);
  renderSummaryStats(dailyData, heatmapRange);
  await renderWeeklyProgress(dailyData);
  renderWeeklyLineChart(dailyData, heatmapRange);
}

init().catch(console.error);
