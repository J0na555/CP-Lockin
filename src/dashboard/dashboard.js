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
  tooltipEl.innerHTML =
    `<strong>${dateKey}</strong><br>LeetCode: ${lc}<br>Codeforces: ${cf}`;
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
  container.innerHTML = "";
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
  container.innerHTML = "";

  const { dates, startKey } = heatmapRange;
  const totalWeeks = getWeekIndex(dates[dates.length - 1], startKey) + 1;
  container.style.gridTemplateColumns = `repeat(${totalWeeks}, var(--cell-size))`;

  let lastMonth = -1;
  for (const dateKey of dates) {
    const month = new Date(dateKey + "T00:00:00").getMonth();
    if (month !== lastMonth) {
      const weekIdx = getWeekIndex(dateKey, startKey);
      const span = document.createElement("span");
      span.className = "month-label";
      span.style.gridColumn = String(weekIdx + 1);
      span.textContent = MONTH_NAMES[month];
      container.appendChild(span);
      lastMonth = month;
    }
  }
}

// ---------------------------------------------------------------------------
// Render: heatmap grid
// ---------------------------------------------------------------------------

function renderHeatmap(dailyData, heatmapRange) {
  const grid = document.getElementById("heatmap-grid");
  if (!grid) return;
  grid.innerHTML = "";

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
  let totalSolved = 0;

  for (const dateKey of dates) {
    const d = dailyData[dateKey];
    if (!d) continue;
    const lc = d.leetcode   ?? 0;
    const cf = d.codeforces ?? 0;
    const total = lc + cf;
    if (total > 0) activeDays++;
    if (lc > 0 && cf > 0) bothDays++;
    totalSolved += total;
  }

  document.getElementById("stat-active-days").textContent  = activeDays;
  document.getElementById("stat-both-days").textContent    = bothDays;
  document.getElementById("stat-total-solved").textContent = totalSolved;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  tooltipEl = document.getElementById("tooltip");

  const heatmapRange = getHeatmapRange(52);
  const dailyData    = await getDailyActivity();

  renderDayLabels();
  renderMonthLabels(heatmapRange);
  renderHeatmap(dailyData, heatmapRange);
  renderSummaryStats(dailyData, heatmapRange);
}

init().catch(console.error);
