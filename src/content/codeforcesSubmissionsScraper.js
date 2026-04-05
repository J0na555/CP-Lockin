"use strict";

(function initializeCodeforcesSubmissionsScraper() {
  const SUPPORTED_PAGE_PATTERN = /^https:\/\/codeforces\.com\/submissions\/[^/?#]+/;
  const ACCEPTED_VERDICT_PATTERN = /\b(Accepted|OK)\b/i;
  const MONTHS = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };

  function isSupportedSubmissionsPage() {
    return SUPPORTED_PAGE_PATTERN.test(window.location.href);
  }

  function getSubmissionRows() {
    return Array.from(document.querySelectorAll("tr[data-submission-id]"));
  }

  function getHandleFromPage() {
    const match = window.location.pathname.match(/^\/submissions\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]).trim() : "";
  }

  function getAbsoluteUrl(href) {
    if (typeof href !== "string" || !href.trim()) {
      return "";
    }

    try {
      return new URL(href, window.location.origin).toString();
    } catch (_) {
      return "";
    }
  }

  function parseProblemId(problemLink) {
    const patterns = [
      /\/contest\/(\d+)\/problem\/([A-Za-z0-9_]+)/,
      /\/problemset\/problem\/(\d+)\/([A-Za-z0-9_]+)/,
      /\/gym\/(\d+)\/problem\/([A-Za-z0-9_]+)/,
      /\/problemset\/gymProblem\/(\d+)\/([A-Za-z0-9_]+)/,
    ];

    for (const pattern of patterns) {
      const match = problemLink.match(pattern);
      if (match) {
        return `${match[1]}${match[2]}`;
      }
    }

    return null;
  }

  function parseSubmissionTimestamp(rawText) {
    const text = (rawText ?? "").trim();
    const match = text.match(
      /^([A-Za-z]{3})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
    );
    if (!match) {
      return 0;
    }

    const monthIndex = MONTHS[match[1]];
    if (monthIndex === undefined) {
      return 0;
    }

    const parsed = new Date(
      Number(match[3]),
      monthIndex,
      Number(match[2]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] ?? 0)
    );
    return Number.isNaN(parsed.getTime()) ? 0 : Math.floor(parsed.getTime() / 1000);
  }

  function getCellText(cells, index) {
    return cells[index]?.textContent?.trim() ?? "";
  }

  function scrapeAcceptedSubmission(row, handle) {
    const submissionId = row.dataset.submissionId?.trim() ?? "";
    const cells = Array.from(row.cells);
    const timeNode = row.querySelector(".format-time");
    const problemAnchor = row.querySelector(
      'a[href*="/problem/"], a[href*="/gym/"], a[href*="/gymProblem/"]'
    );
    const problemLink = getAbsoluteUrl(problemAnchor?.getAttribute("href") ?? "");
    const verdict = getCellText(cells, 5) || row.querySelector(".status-small")?.textContent?.trim() || "";
    const timestamp = parseSubmissionTimestamp(
      timeNode?.getAttribute("title") || timeNode?.textContent || getCellText(cells, 1)
    );
    const problemName = problemAnchor?.textContent?.trim() || getCellText(cells, 3);

    if (
      !submissionId ||
      !timestamp ||
      !problemName ||
      !problemLink ||
      !ACCEPTED_VERDICT_PATTERN.test(verdict)
    ) {
      return null;
    }

    return {
      platform: "codeforces",
      submissionId,
      timestamp,
      problemId: parseProblemId(problemLink),
      problemName,
      problemLink,
      verdict,
      language: getCellText(cells, 4),
      source: /\/gym\/|\/gymProblem\//.test(problemLink) ? "gym" : "regular",
      handle,
    };
  }

  function getAcceptedSubmissions() {
    const handle = getHandleFromPage();
    return getSubmissionRows()
      .map((row) => scrapeAcceptedSubmission(row, handle))
      .filter(Boolean);
  }

  async function sendAcceptedSubmissions() {
    const submissions = getAcceptedSubmissions();
    if (submissions.length === 0) {
      return;
    }

    try {
      await browser.runtime.sendMessage({
        type: "cfDomSubmissions",
        payload: {
          page: window.location.href,
          handle: getHandleFromPage(),
          collectedAt: Math.floor(Date.now() / 1000),
          submissions,
        },
      });
    } catch (_) {
      // Ignore transient messaging failures on pages that unload quickly.
    }
  }

  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
      return;
    }

    callback();
  }

  if (!isSupportedSubmissionsPage()) {
    return;
  }

  onReady(() => {
    window.setTimeout(() => {
      sendAcceptedSubmissions().catch(() => {});
    }, 0);
  });
})();
