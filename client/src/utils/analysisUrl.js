/** In-app path for the intel analysis page (same tab / SPA navigation). */
export function analysisPagePath(victimId) {
  if (victimId === undefined || victimId === null || victimId === "") {
    return "/analysis/_";
  }
  return `/analysis/${encodeURIComponent(String(victimId))}`;
}

export function breachAnalysisPagePath(victimId) {
  if (victimId === undefined || victimId === null || victimId === "") {
    return "/leaks/breach/_";
  }
  return `/leaks/breach/${encodeURIComponent(String(victimId))}`;
}
