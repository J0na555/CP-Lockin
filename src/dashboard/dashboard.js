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
    const month = parseDateKey(dateKey).getMonth();
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

  for (const dateKey of dates) {
    const d = dailyData[dateKey];
    if (!d) continue;
    const lc = d.leetcode   ?? 0;
    const cf = d.codeforces ?? 0;
    const total = lc + cf;
    if (total > 0) activeDays++;
    if (lc > 0 && cf > 0) bothDays++;
  }

  const weekKeys = getCalendarWeekDateKeys();
  let weekLc = 0;
  let weekCf = 0;
  for (const k of weekKeys) {
    const d = dailyData[k];
    if (!d) continue;
    weekLc += d.leetcode ?? 0;
    weekCf += d.codeforces ?? 0;
  }
  const overallWeekSolved = weekLc + weekCf;

  document.getElementById("stat-active-days").textContent = activeDays;
  document.getElementById("stat-both-days").textContent = bothDays;
  document.getElementById("stat-week-lc").textContent = weekLc;
  document.getElementById("stat-week-cf").textContent = weekCf;
  document.getElementById("stat-total-all").textContent = overallWeekSolved;
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

function renderWeeklyLineChart(dailyData, heatmapRange) {
  const container = document.getElementById("weekly-chart");
  if (!container) return;

  const { lc, cf, weekCount } = aggregateWeeklyCounts(dailyData, heatmapRange);
  if (weekCount < 1) {
    container.innerHTML = "";
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
  const tickEls = ticks
    .map((t) => {
      const yy = yAt(t);
      return `<line class="chart-grid" x1="${padL}" y1="${yy.toFixed(1)}" x2="${padL + innerW}" y2="${yy.toFixed(1)}"/>
        <text class="chart-axis" x="${padL - 6}" y="${yy + 4}" text-anchor="end">${t}</text>`;
    })
    .join("");

  const ariaLabel = `Problems per week over ${weekCount} weeks. LeetCode and Codeforces.`;
  container.innerHTML = `
    <svg class="weekly-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${ariaLabel}">
      ${tickEls}
      <path class="chart-area chart-area-cf" d="${pathCfArea}" />
      <path class="chart-area chart-area-lc" d="${pathLcArea}" />
      <path class="chart-line chart-line-cf" fill="none" d="${dLine(cf)}" />
      <path class="chart-line chart-line-lc" fill="none" d="${dLine(lc)}" />
      <text class="chart-axis chart-axis-x" x="${padL + innerW / 2}" y="${H - 8}" text-anchor="middle">Weeks (older → newer)</text>
    </svg>
  `;
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
  renderWeeklyLineChart(dailyData, heatmapRange);
}

init().catch(console.error);
