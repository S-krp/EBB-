const storageKey = "ebb.notice-pids";

/** @param {string} query */
export function parsePids(query) {
  return new Set(query.toUpperCase().split(/[,\s]+/).filter(Boolean));
}

/**
 * @param {{ title: string, body?: string }} notice
 * @param {ReadonlySet<string>} pids
 */
export function matchesPid(notice, pids) {
  if (!pids.size) return true;
  const text = `${notice.title}\n${notice.body ?? ""}`.toUpperCase();
  for (const [token] of text.matchAll(/[A-Z0-9]+(?:[-_][A-Z0-9]+)*/g)) {
    if (pids.has(token)) return true;
  }
  return false;
}

export function loadPidFilter() {
  try {
    return window.localStorage.getItem(storageKey) ?? "";
  } catch {
    return "";
  }
}

/** @param {string} query */
export function savePidFilter(query) {
  try {
    if (query) window.localStorage.setItem(storageKey, query);
    else window.localStorage.removeItem(storageKey);
  } catch {
    // Filtering still works if browser storage is unavailable.
  }
}
