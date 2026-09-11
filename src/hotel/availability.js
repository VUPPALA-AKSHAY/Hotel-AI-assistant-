/**
 * Deterministic room availability for the fictional hotel.
 * All functions are pure so tests are stable and repeatable.
 */
const { kb } = require('./knowledge');
const inventory = require('./inventory.json');

const MAX_NIGHTS = 30;
const MAX_GUESTS = 8;

/* ---------- helpers ---------- */

function parseIsoDate(str) {
  if (!str) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

function toIso(date) {
  return date.toISOString().slice(0, 10);
}

function nightsBetween(checkIn, checkOut) {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000);
}

/** Stable hash -> [0,1) for a string (keeps availability deterministic per date + room). */
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = h >>> 0;
  return ((Math.sin(a) * 9301 + 49297) % 233280) / 233280;
}

/* ---------- date / request extraction ---------- */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];

function monthIndex(token) {
  const clean = token.toLowerCase().replace(/[^a-z]/g, '');
  const idx = MONTHS.indexOf(clean);
  if (idx >= 0) return idx;
  const short = clean.slice(0, 3);
  return MONTHS.findIndex((m) => m.startsWith(short) && short.length >= 3);
}

/**
 * Pull {checkIn, checkOut, adults, children} out of free text.
 * Supports ISO dates, English month names, and relative dates (tomorrow, next month, next week).
 * For vague dates like "next month" or "October", picks sensible defaults (1st of that month, 1 night).
 * Returns null when no date can be found.
 */
function extractRequest(text) {
  if (!text) return null;
  const found = new Set();
  const isoRe = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  let m;
  while ((m = isoRe.exec(text))) found.add(`${m[1]}-${m[2]}-${m[3]}`);

  const monthNames = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)';

  // Relative dates: tomorrow, next week, next month
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (/\btomorrow\b/i.test(text)) {
    const t = new Date(today.getTime() + 86400000);
    found.add(toIso(t));
  }
  if (/\btonight\b/i.test(text)) {
    found.add(toIso(today));
  }
  if (/\bnext week\b/i.test(text)) {
    const t = new Date(today.getTime() + 7 * 86400000);
    found.add(toIso(t));
  }
  if (/\bnext month\b/i.test(text)) {
    const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
    found.add(toIso(t));
  }

  // Slash/dash/dot separators: DD/MM/YYYY, DD/MMM/YYYY, DD-MM-YYYY, DD.MMM.YYYY etc.
  const sepDateRe = new RegExp(`\\b(\\d{1,2})[/\\-\\.](\\d{1,2}|${monthNames})[/\\-\\.](\\d{2,4})\\b`, 'gi');
  while ((m = sepDateRe.exec(text))) {
    const dd = Number(m[1]);
    let mm;
    if (/^\d+$/.test(m[2])) {
      mm = Number(m[2]) - 1; // 0-indexed
    } else {
      mm = monthIndex(m[2]);
    }
    const yearGroup = m[4] || m[3]; // m[4] when month is name (nested group), m[3] when digit
    let yyyy = Number(yearGroup);
    if (yyyy < 100) yyyy += 2000;
    if (mm >= 0 && mm <= 11 && dd >= 1 && dd <= 31 && yyyy >= 2020 && yyyy <= 2030) {
      found.add(toIso(new Date(Date.UTC(yyyy, mm, dd))));
    }
  }

  // day-month-year: "15 March 2026"
  const dmRe = new RegExp(`\\b(\\d{1,2})[a-z]*\\s+${monthNames}[a-z]*\\s+(\\d{4})\\b`, 'gi');
  while ((m = dmRe.exec(text))) {
    const idx = monthIndex(m[2]);
    const dd = Number(m[1]);
    const yyyy = Number(m[3]);
    if (idx >= 0 && dd >= 1 && dd <= 31) found.add(toIso(new Date(Date.UTC(yyyy, idx, dd))));
  }
  // month-day-year: "March 15 2026"
  const mdRe = new RegExp(`\\b${monthNames}[a-z]*\\s+(\\d{1,2})[a-z]*(?:,)?\\s+(\\d{4})\\b`, 'gi');
  while ((m = mdRe.exec(text))) {
    const idx = monthIndex(m[1]);
    const dd = Number(m[2]);
    const yyyy = Number(m[3]);
    if (idx >= 0 && dd >= 1 && dd <= 31) found.add(toIso(new Date(Date.UTC(yyyy, idx, dd))));
  }
  // Month + day without year: "October 15", "15 October" -> assume next occurrence
  const mdNoYearRe = new RegExp(`\\b${monthNames}[a-z]*\\s+(\\d{1,2})[a-z]*\\b`, 'gi');
  while ((m = mdNoYearRe.exec(text))) {
    // Avoid double-counting if year already captured
    if (found.size) break;
    const idx = monthIndex(m[1]);
    const dd = Number(m[2]);
    if (idx < 0 || dd < 1 || dd > 31) continue;
    let yyyy = today.getUTCFullYear();
    let cand = new Date(Date.UTC(yyyy, idx, dd));
    if (cand < today) cand = new Date(Date.UTC(yyyy + 1, idx, dd));
    found.add(toIso(cand));
  }
  const dmNoYearRe = new RegExp(`\\b(\\d{1,2})[a-z]*\\s+${monthNames}[a-z]*\\b`, 'gi');
  while ((m = dmNoYearRe.exec(text))) {
    if (found.size) break;
    const idx = monthIndex(m[2]);
    const dd = Number(m[1]);
    if (idx < 0 || dd < 1 || dd > 31) continue;
    let yyyy = today.getUTCFullYear();
    let cand = new Date(Date.UTC(yyyy, idx, dd));
    if (cand < today) cand = new Date(Date.UTC(yyyy + 1, idx, dd));
    found.add(toIso(cand));
  }
  // Month alone: "October", "next month" already handled, but "in October" -> Oct 1
  const monthOnlyRe = new RegExp(`\\b${monthNames}[a-z]*\\b`, 'gi');
  let monthOnlyMatch = null;
  while ((m = monthOnlyRe.exec(text))) {
    if (found.size) break;
    monthOnlyMatch = m;
  }
  if (!found.size && monthOnlyMatch) {
    const idx = monthIndex(monthOnlyMatch[1]);
    if (idx >= 0) {
      let yyyy = today.getUTCFullYear();
      let cand = new Date(Date.UTC(yyyy, idx, 1));
      if (cand < today) cand = new Date(Date.UTC(yyyy + 1, idx, 1));
      found.add(toIso(cand));
    }
  }
  // Handle typos: tommorw, tommorow, tomorow -> tomorrow
  if (!found.size && /tomm?o?r+o?w/i.test(text)) {
    const t = new Date(today.getTime() + 86400000);
    found.add(toIso(t));
  }

  if (!found.size) return null;

  const dates = [...found];
  const d1 = parseIsoDate(dates[0]);
  let d2 = parseIsoDate(dates[1]);
  if (!d2 || d2 <= d1) {
    // Check for explicit night count: "for 3 nights", "2 nights"
    const nightMatch = text.match(/(\d+)\s*nights?/i);
    const nights = nightMatch ? Math.max(1, Math.min(MAX_NIGHTS, Number(nightMatch[1]))) : 1;
    d2 = new Date(d1.getTime() + nights * 86400000);
  }

  let adults = 2;
  const aMatch = text.match(/(\d+)\s*(?:adults?|persons?|people|guests?)/i);
  if (aMatch) adults = Math.max(1, Number(aMatch[1]));

  let children = 0;
  const cMatch = text.match(/(\d+)\s*(?:child(?:ren)?|kid(?:s)?)\b/i);
  if (cMatch) children = Math.max(0, Number(cMatch[1]));

  const gMatch = text.match(/\bfor\s+(\d+)\s*guests?\b/i);
  if (gMatch && !aMatch && !cMatch) adults = Math.max(1, Number(gMatch[1]));

  // Handle "X rooms" -> estimate guests (2 per room) if no guest count given
  const roomMatch = text.match(/(\d+)\s*rooms?/i);
  if (roomMatch && !aMatch && !gMatch) {
    const rooms = Number(roomMatch[1]);
    // If they say "5 rooms" and elsewhere "10 guests", the guest match will already have 10
    // If only rooms given, assume 2 guests per room
    if (!text.match(/\d+\s*(?:guests?|adults?|people)/i)) {
      adults = Math.min(MAX_GUESTS, Math.max(1, rooms * 2));
      adults = Math.min(adults, MAX_GUESTS);
    }
  }
  // Handle "X guests across Y rooms" or "X guests ... Y rooms" (counts separated
  // by other words, e.g. "10 guests next month 5 rooms") -> guests per room.
  const acrossMatch = text.match(/(\d+)\s*guests?\s*across\s*(\d+)\s*rooms?/i);
  const guestCount = text.match(/(\d+)\s*(?:guests?|persons?|people)\b/i);
  const roomNumMatch = text.match(/(\d+)\s*rooms?\b/i);
  if (acrossMatch) {
    const total = Number(acrossMatch[1]);
    const rooms = Number(acrossMatch[2]);
    adults = Math.max(1, Math.ceil(total / Math.max(1, rooms)));
  } else if (guestCount && roomNumMatch) {
    // e.g. "5 guests, 5 rooms" -> 1 per room; "10 guests next month 5 rooms" -> 2 per room
    const total = Number(guestCount[1]);
    const rooms = Number(roomNumMatch[1]);
    adults = Math.max(1, Math.ceil(total / Math.max(1, rooms)));
  }

  // Clamp 0 guests to 1 (0 is invalid)
  if (adults === 0) adults = 1;

  return {
    checkIn: toIso(d1),
    checkOut: toIso(d2),
    adults: Math.min(adults, MAX_GUESTS),
    children: Math.min(children, 6),
  };
}

/* ---------- validation ---------- */

function validateRequest(params) {
  const errors = [];
  const checkIn = parseIsoDate(params.checkIn);
  const checkOut = parseIsoDate(params.checkOut);

  if (!checkIn) errors.push('checkIn must be a valid YYYY-MM-DD date');
  if (!checkOut) errors.push('checkOut must be a valid YYYY-MM-DD date');
  if (checkIn && checkOut && checkOut <= checkIn) errors.push('checkOut must be after checkIn');
  if (checkIn && checkOut && checkOut > checkIn) {
    const nights = nightsBetween(checkIn, checkOut);
    if (nights > MAX_NIGHTS) errors.push(`stay length cannot exceed ${MAX_NIGHTS} nights`);
  }

  const adults = Number(params.adults ?? 2);
  const children = Number(params.children ?? 0);
  if (!Number.isInteger(adults) || adults < 1 || adults > MAX_GUESTS)
    errors.push(`adults must be an integer between 1 and ${MAX_GUESTS}`);
  if (!Number.isInteger(children) || children < 0 || children > 6)
    errors.push('children must be an integer between 0 and 6');

  return {
    ok: errors.length === 0,
    errors,
    params: {
      checkIn,
      checkOut,
      nights: checkIn && checkOut && checkOut > checkIn ? nightsBetween(checkIn, checkOut) : 0,
      adults,
      children,
    },
  };
}

/* ---------- deterministic availability ---------- */

function roomFits(room, adults, children) {
  const maxAdults = Number(room['Max Adults'] || 99);
  const maxChildren = Number(room['Max Children'] || 99);
  const maxGuests = Number(room['Max Guests'] || maxAdults + maxChildren);
  return adults <= maxAdults && children <= maxChildren && adults + children <= maxGuests;
}

function availableCount(roomName, checkIn, total) {
  const seed = `${checkIn}|${roomName}`;
  const factor = 0.28 + hash01(seed) * 0.55; // deterministic daily occupancy 28%..83%
  const occupied = Math.floor(total * factor);
  return Math.max(0, total - occupied);
}

/**
 * Returns available rooms for a date range.
 * @returns {{ok:boolean, errors?:string[], nights:number, results:Array<object>}}
 */
function checkAvailability({ checkIn, checkOut, adults = 2, children = 0 }) {
  const validation = validateRequest({ checkIn, checkOut, adults, children });
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, nights: 0, results: [] };
  }
  const { checkIn: ci, checkOut: co, nights } = validation.params;
  const results = kb.rooms
    .map((room) => {
      const total = Number(inventory.rooms[room.name]?.total || 0);
      const available = availableCount(room.name, toIso(ci), total);
      const fits = roomFits(room, validation.params.adults, validation.params.children);
      const pricePerNight = Number(room['Price Per Night'] || 0);
      return {
        roomId: room.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: room.name,
        type: room.Type,
        fits,
        available,
        maxGuests: Number(room['Max Guests']),
        bed: room.Bed,
        size: room.Size,
        view: room.View,
        pricePerNight,
        nights,
        totalPrice: pricePerNight * nights,
        breakfastIncluded: String(room.Breakfast).toLowerCase() === 'included',
      };
    })
    .sort((a, b) => a.pricePerNight - b.pricePerNight);

  return { ok: true, nights, results };
}

/** Plain-language availability summary for the LLM / UI. */
function formatAvailability(result) {
  if (!result.ok) return `I could not compute availability: ${result.errors.join('; ')}`;
  if (!result.results.length) return 'No rooms are listed in the hotel.';
  const lines = result.results.map((r) => {
    const state = r.fits ? (r.available > 0 ? `AVAILABLE (${r.available} left, ${r.totalPrice} INR total for ${r.nights} nights)` : 'SOLD OUT for these dates') : 'DOES NOT FIT your party';
    return `- ${r.name} (${r.bed}, ${r.size}, up to ${r.maxGuests} guests): ${r.pricePerNight} INR/night. ${state}.`;
  });
  return `Rooms for ${result.nights} night(s):\n${lines.join('\n')}`;
}

/** Which room best fits a guest count (knowledge answer without dates). */
function bestRoomForGuests(count) {
  const fits = kb.rooms
    .filter((r) => Number(r['Max Guests']) >= count)
    .sort((a, b) => Number(a['Max Guests']) - Number(b['Max Guests']));
  return fits[0] || null;
}

module.exports = {
  extractRequest,
  validateRequest,
  checkAvailability,
  formatAvailability,
  bestRoomForGuests,
  parseIsoDate,
  nightsBetween,
};