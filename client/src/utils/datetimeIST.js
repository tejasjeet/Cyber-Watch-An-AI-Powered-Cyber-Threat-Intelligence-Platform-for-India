/** India Standard Time — used for all user-visible dates/times in the client. */
export const TZ_INDIA = "Asia/Kolkata";

function istPartsFromMs(ms) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_INDIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = f.formatToParts(new Date(ms));
  const o = {};
  for (const p of parts) {
    if (p.type !== "literal") o[p.type] = p.value;
  }
  return o;
}

/** `YYYY-MM-DD` in the India calendar for this instant. */
export function formatDateKeyIST(ms) {
  if (ms == null || !Number.isFinite(ms)) return "";
  const o = istPartsFromMs(ms);
  return `${o.year}-${o.month}-${o.day}`;
}

/** `YYYY-MM-DD HH:mm IST` */
export function formatMsIST(ms) {
  if (ms == null || !Number.isFinite(ms)) return null;
  const o = istPartsFromMs(ms);
  return `${o.year}-${o.month}-${o.day} ${o.hour}:${o.minute} IST`;
}

/** `YYYY-MM-DD IST` (calendar date only; instant is still the parsed discovery ms). */
export function formatMsISTDateOnly(ms) {
  if (ms == null || !Number.isFinite(ms)) return null;
  const o = istPartsFromMs(ms);
  return `${o.year}-${o.month}-${o.day} IST`;
}

/** `HH:mm:ss` in IST (wall clock). */
export function formatTimeIST(ms) {
  if (ms == null || !Number.isFinite(ms)) return null;
  const o = istPartsFromMs(ms);
  return `${o.hour}:${o.minute}:${o.second}`;
}

/** Calendar year in India for this instant. */
export function calendarYearIST(ms) {
  if (ms == null || !Number.isFinite(ms)) return null;
  const y = Number(istPartsFromMs(ms).year);
  return Number.isFinite(y) ? y : null;
}

function addCalendarDaysGregorian(y, mo, d, delta) {
  const x = new Date(Date.UTC(y, mo - 1, d + delta));
  return { y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate() };
}

/**
 * IST calendar `YYYY-MM-DD` keys for the last `n` days ending on “today” in India.
 * Used for velocity / day buckets aligned to local operations time.
 */
export function istDateKeysLastNDays(n = 7) {
  const o = istPartsFromMs(Date.now());
  const y = Number(o.year);
  const mo = Number(o.month);
  const d = Number(o.day);
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    const p = addCalendarDaysGregorian(y, mo, d, -i);
    keys.push(`${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`);
  }
  return keys;
}
