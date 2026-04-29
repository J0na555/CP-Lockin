const CODEFORCES_SUBMISSION_SOURCES = {
  REGULAR: "regular",
  GYM: "gym",
};

/**
 * @param {unknown} source
 * @param {string} [problemLink]
 * @returns {"regular"|"gym"}
 */
function normalizeCodeforcesSource(source, problemLink = "") {
  if (source === CODEFORCES_SUBMISSION_SOURCES.GYM) {
    return CODEFORCES_SUBMISSION_SOURCES.GYM;
  }

  return /\/gym\/|\/gymProblem\//.test(problemLink)
    ? CODEFORCES_SUBMISSION_SOURCES.GYM
    : CODEFORCES_SUBMISSION_SOURCES.REGULAR;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeOptionalString(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizeTimestampSeconds(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? Math.floor(timestamp) : 0;
}

/**
 * @param {string} href
 * @returns {string|null}
 */
function parseCodeforcesProblemIdFromLink(href) {
  const patterns = [
    /\/contest\/(\d+)\/problem\/([A-Za-z0-9_]+)/,
    /\/problemset\/problem\/(\d+)\/([A-Za-z0-9_]+)/,
    /\/gym\/(\d+)\/problem\/([A-Za-z0-9_]+)/,
    /\/problemset\/gymProblem\/(\d+)\/([A-Za-z0-9_]+)/,
  ];

  for (const pattern of patterns) {
    const match = href.match(pattern);
    if (match) {
      return `${match[1]}${match[2]}`;
    }
  }

  return null;
}

/**
 * @param {unknown} problem
 * @returns {string|null}
 */
function getCodeforcesProblemId(problem) {
  if (!problem || typeof problem !== "object") {
    return null;
  }

  const contestId = "contestId" in problem ? normalizeOptionalString(problem.contestId) : "";
  const index = "index" in problem ? normalizeOptionalString(problem.index) : "";
  if (!contestId && !index) {
    return null;
  }
  return `${contestId}${index}`;
}

/**
 * @param {unknown} problem
 * @returns {string}
 */
function getCodeforcesProblemName(problem) {
  if (!problem || typeof problem !== "object") {
    return "";
  }

  return "name" in problem ? normalizeOptionalString(problem.name) : "";
}

/**
 * @param {object} submission
 * @param {string} handle
 * @returns {object|null}
 */
function normalizeCodeforcesApiSubmission(submission, handle = "") {
  if (!submission || typeof submission !== "object") {
    return null;
  }

  const submissionId = normalizeOptionalString(submission.id);
  const timestamp = normalizeTimestampSeconds(submission.creationTimeSeconds);
  const problemId = getCodeforcesProblemId(submission.problem);
  const problemName = getCodeforcesProblemName(submission.problem);
  const normalizedHandle = normalizeOptionalString(handle);
  const verdict = normalizeOptionalString(submission.verdict);
  const programmingLanguage = normalizeOptionalString(submission.programmingLanguage);

  if (!submissionId || !timestamp || !problemName) {
    return null;
  }

  return {
    platform: PLATFORMS.CODEFORCES,
    submissionId,
    problemId,
    problemName,
    timestamp,
    handle: normalizedHandle,
    problemLink: "",
    verdict,
    language: programmingLanguage,
    source: CODEFORCES_SUBMISSION_SOURCES.REGULAR,
  };
}

/**
 * @param {object} submission
 * @returns {object|null}
 */
function normalizeCodeforcesDomSubmission(submission) {
  if (!submission || typeof submission !== "object") {
    return null;
  }

  const submissionId = normalizeOptionalString(submission.submissionId);
  const timestamp = normalizeTimestampSeconds(submission.timestamp);
  const problemLink = normalizeOptionalString(submission.problemLink);
  const problemName = normalizeOptionalString(submission.problemName);
  const normalizedHandle = normalizeOptionalString(submission.handle);
  const verdict = normalizeOptionalString(submission.verdict);
  const language = normalizeOptionalString(submission.language);
  const explicitProblemId = normalizeOptionalString(submission.problemId);
  const problemId = explicitProblemId || parseCodeforcesProblemIdFromLink(problemLink);

  if (!submissionId || !timestamp || !problemName || !problemLink) {
    return null;
  }

  return {
    platform: PLATFORMS.CODEFORCES,
    submissionId,
    problemId,
    problemName,
    timestamp,
    handle: normalizedHandle,
    problemLink,
    verdict,
    language,
    source: normalizeCodeforcesSource(submission.source, problemLink),
  };
}

/**
 * @param {object} submission
 * @returns {string}
 */
function getCodeforcesSubmissionMergeKey(submission) {
  if (!submission || typeof submission !== "object") {
    return "";
  }

  const submissionId = normalizeOptionalString(submission.submissionId);
  if (submissionId) {
    return `${PLATFORMS.CODEFORCES}:${submissionId}`;
  }

  const problemId = normalizeOptionalString(submission.problemId);
  const timestamp = normalizeTimestampSeconds(submission.timestamp);
  if (!problemId || !timestamp) {
    return "";
  }

  return `${PLATFORMS.CODEFORCES}:${problemId}:${timestamp}`;
}

/**
 * @param {object} current
 * @param {object} candidate
 * @returns {object}
 */
function mergeCodeforcesSubmission(current, candidate) {
  const merged = { ...current };

  const fieldsToBackfill = [
    "submissionId",
    "problemId",
    "problemName",
    "timestamp",
    "handle",
    "problemLink",
    "verdict",
    "language",
  ];

  for (const field of fieldsToBackfill) {
    const nextValue = candidate[field];
    if (
      merged[field] === undefined ||
      merged[field] === null ||
      merged[field] === "" ||
      merged[field] === 0
    ) {
      merged[field] = nextValue;
    }
  }

  if (candidate.problemLink) {
    merged.problemLink = candidate.problemLink;
  }
  if (candidate.language) {
    merged.language = candidate.language;
  }
  if (candidate.verdict) {
    merged.verdict = candidate.verdict;
  }
  if (
    candidate.source === CODEFORCES_SUBMISSION_SOURCES.GYM ||
    (!merged.source && candidate.source)
  ) {
    merged.source = candidate.source;
  }

  merged.platform = PLATFORMS.CODEFORCES;
  merged.source = normalizeCodeforcesSource(merged.source, merged.problemLink);
  return merged;
}

/**
 * @param {...Array<object>} submissionCollections
 * @returns {Array<object>}
 */
function mergeCodeforcesSubmissionCollections(...submissionCollections) {
  const mergedByKey = new Map();

  for (const collection of submissionCollections) {
    const submissions = Array.isArray(collection) ? collection : [];
    for (const submission of submissions) {
      const key = getCodeforcesSubmissionMergeKey(submission);
      if (!key) continue;

      const existing = mergedByKey.get(key);
      mergedByKey.set(
        key,
        existing ? mergeCodeforcesSubmission(existing, submission) : { ...submission }
      );
    }
  }

  return Array.from(mergedByKey.values()).sort((a, b) => a.timestamp - b.timestamp);
}
