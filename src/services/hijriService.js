// ─── Hijri Calendar Service (Override-Anchored, 30-day cascade) ────────────────
// Approach: The community calendar is driven ENTIRELY by monthly overrides.
// Each override anchors day 1 of a Hijri month to an exact Gregorian date.
// Months without an override are assumed to be 30 days, counted forward from
// the most recent prior override. No astronomical moon calculation is used for
// the community calendar — only as a last-resort seed if NO overrides exist.

export const HIJRI_MONTHS = [
  { value: 1,  name: "Muharram"        },
  { value: 2,  name: "Safar"           },
  { value: 3,  name: "Rabi al-Awwal"  },
  { value: 4,  name: "Rabi al-Thani"  },
  { value: 5,  name: "Jumada al-Awwal"},
  { value: 6,  name: "Jumada al-Thani"},
  { value: 7,  name: "Rajab"          },
  { value: 8,  name: "Sha'ban"        },
  { value: 9,  name: "Ramadan"        },
  { value: 10, name: "Shawwal"        },
  { value: 11, name: "Dhu al-Qi'dah" },
  { value: 12, name: "Dhu al-Hijjah" },
];

const MONTH_DAYS = 30; // assumed length of an un-anchored month

// ── JDN helpers ────────────────────────────────────────────────────────────
function gregorianToJdn(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y
       + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}
function jdnToGregorian(jdn) {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day:   e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year:  100 * b + d - 4800 + Math.floor(m / 10),
  };
}
// Astronomical seed — used ONLY when there are zero overrides configured.
function islamicToJdnAstro(year, month, day) {
  return day + Math.ceil(29.5 * (month - 1)) + (year - 1) * 354
       + Math.floor((3 + 11 * year) / 30) + 1948439;
}
function jdnToIslamicAstro(jdn) {
  const year  = Math.floor((30 * (jdn - 1948439) + 10646) / 10631);
  const month = Math.min(12, Math.ceil((jdn - 29 - islamicToJdnAstro(year, 1, 1)) / 29.5) + 1);
  const day   = jdn - islamicToJdnAstro(year, month, 1) + 1;
  return { year, month, day };
}

// ── Month index helpers ─────────────────────────────────────────────────────
// Convert a (year, month) to an absolute month index for easy arithmetic.
function monthIndex(year, month) { return year * 12 + (month - 1); }
function fromMonthIndex(idx) {
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}
function compareHijri(a, b) {
  return a.year !== b.year ? a.year - b.year
       : a.month !== b.month ? a.month - b.month
       : (a.day || 1) - (b.day || 1);
}
function sortOverrides(arr) {
  return [...(arr || [])]
    .filter(o => o && o.hYear && o.hMonth && o.gDate)
    .sort((a, b) => compareHijri(
      { year: a.hYear, month: a.hMonth },
      { year: b.hYear, month: b.hMonth }
    ));
}

// ── Core: JDN of day 1 of a given Hijri month ────────────────────────────────
// Finds the most recent override at or before the target month, then adds
// 30 days per intervening un-anchored month.
function monthStartJdn(hYear, hMonth, overrides) {
  const sorted = sortOverrides(overrides);
  const targetIdx = monthIndex(hYear, hMonth);

  if (sorted.length === 0) {
    // No overrides at all — fall back to astronomical calc as a seed
    return islamicToJdnAstro(hYear, hMonth, 1);
  }

  // Find the latest override whose month index <= target month index
  let anchor = null;
  for (const ov of sorted) {
    if (monthIndex(ov.hYear, ov.hMonth) <= targetIdx) anchor = ov;
    else break;
  }

  if (anchor) {
    // Count 30 days for each month between the anchor and target
    const [ay, am, ad] = anchor.gDate.split("-").map(Number);
    const anchorJdn = gregorianToJdn(ay, am, ad);
    const monthsForward = targetIdx - monthIndex(anchor.hYear, anchor.hMonth);
    return anchorJdn + monthsForward * MONTH_DAYS;
  } else {
    // Target is BEFORE the earliest override — count backwards 30 days/month
    const earliest = sorted[0];
    const [ey, em, ed] = earliest.gDate.split("-").map(Number);
    const earliestJdn = gregorianToJdn(ey, em, ed);
    const monthsBack = monthIndex(earliest.hYear, earliest.hMonth) - targetIdx;
    return earliestJdn - monthsBack * MONTH_DAYS;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Convert Hijri (y,m,d) → Gregorian {year,month,day} */
export function adjustedIslamicToGregorian(hYear, hMonth, hDay, overrides = []) {
  const startJdn = monthStartJdn(hYear, hMonth, overrides);
  return jdnToGregorian(startJdn + (hDay - 1));
}

/** Convert Gregorian (y,m,d) → Hijri {year,month,day} */
export function adjustedGregorianToIslamic(gYear, gMonth, gDay, overrides = []) {
  try {
    if (!gYear || !gMonth || !gDay) return { year: 0, month: 0, day: 0 };
    const safeOverrides = sortOverrides(overrides);
    const target = gregorianToJdn(gYear, gMonth, gDay);

    if (safeOverrides.length === 0) {
      return jdnToIslamicAstro(target);
    }

    // Start from an astronomical approximation, then search nearby months
    // using our override-anchored month starts to find the exact bucket.
    const approx = jdnToIslamicAstro(target);
    const approxIdx = monthIndex(approx.year, approx.month);

    // Search a window of months around the approximation
    for (let off = -4; off <= 4; off++) {
      const { year, month } = fromMonthIndex(approxIdx + off);
      const start     = monthStartJdn(year, month, safeOverrides);
      const nextIdx   = monthIndex(year, month) + 1;
      const nxt       = fromMonthIndex(nextIdx);
      const nextStart = monthStartJdn(nxt.year, nxt.month, safeOverrides);
      if (target >= start && target < nextStart) {
        return { year, month, day: target - start + 1 };
      }
    }
    return approx;
  } catch {
    return { year: 0, month: 0, day: 0 };
  }
}

/** Hijri → "YYYY-MM-DD" */
export function hijriToGregorian(hDay, hMonth, hYear, overrides = []) {
  try {
    if (!hDay || !hMonth || !hYear) return null;
    const g = adjustedIslamicToGregorian(hYear, hMonth, hDay, overrides);
    if (!g || !g.year) return null;
    return `${g.year}-${String(g.month).padStart(2, "0")}-${String(g.day).padStart(2, "0")}`;
  } catch {
    return null;
  }
}

/** Gregorian "YYYY-MM-DD" → display string "5 Muharram 1448 AH" */
export function getHijriDisplay(gregorianDate, overrides = []) {
  try {
    if (!gregorianDate || typeof gregorianDate !== 'string') return "";
    const parts = gregorianDate.split("-").map(Number);
    if (parts.length < 3 || parts.some(isNaN)) return "";
    const [y, m, d] = parts;
    const h = adjustedGregorianToIslamic(y, m, d, overrides);
    if (!h || !h.year || !h.month || !h.day) return "";
    const monthName = HIJRI_MONTHS.find(x => x.value === h.month)?.name || "";
    return `${h.day} ${monthName} ${h.year} AH`;
  } catch {
    return "";
  }
}

/** Gregorian date → Hijri {year,month,day} */
export function getHijriParts(gregorianDate, overrides = []) {
  try {
    const [y, m, d] = (typeof gregorianDate === "string"
      ? gregorianDate : gregorianDate.toISOString().slice(0, 10)
    ).split("-").map(Number);
    return adjustedGregorianToIslamic(y, m, d, overrides);
  } catch {
    return { year: 0, month: 0, day: 0 };
  }
}

/** Build display string from numeric components */
export function hijriDisplayFromParts(hDay, hMonth, hYear) {
  if (!hDay || !hMonth || !hYear) return "";
  const monthName = HIJRI_MONTHS.find(m => m.value === hMonth)?.name || "";
  return `${hDay} ${monthName} ${hYear} AH`;
}

/** Current Hijri year */
export function getCurrentHijriYear(overrides = []) {
  const d = new Date();
  return adjustedGregorianToIslamic(d.getFullYear(), d.getMonth() + 1, d.getDate(), overrides).year;
}
