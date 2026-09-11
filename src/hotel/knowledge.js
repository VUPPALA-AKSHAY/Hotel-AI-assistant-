/**
 * Knowledge retriever over src/hotel/hotel-knowledge.json.
 * The assistant may only answer from this data. Downstream consumers
 * receive a grounded, deterministic context block plus their sources.
 */
const kb = require('./hotel-knowledge.json');

const STOP_WORDS = new Set(
  'is are was were the a an do does did i we you they he she it for and of to in on at what whats how when where which whom who can could should please tell me know about give some'.split(' ')
);

function normalize(str) {
  return String(str || '')
    .replace(/[^a-z0-9\s/'-]/gi, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(str) {
  return normalize(str)
    .split(' ')
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/** Levenshtein distance — used for typo tolerance in scoring. */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

/** Check if two tokens are close enough to be considered a match (typo tolerant). */
function fuzzyMatch(tokA, tokB) {
  if (tokA === tokB) return true;
  const maxLen = Math.max(tokA.length, tokB.length);
  if (maxLen <= 3) return tokA === tokB; // short words must be exact
  return levenshtein(tokA, tokB) <= 1; // 1 edit distance for longer words
}

function toText(fields) {
  return Object.entries(fields || {})
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: ${v.join(', ')}`;
      return `${k}: ${v}`;
    })
    .join('. ');
}

/** Build a flat, searchable index of every known fact. */
function buildUnits() {
  const units = [];
  const push = (category, title, text, keywords = [], raw = null) =>
    units.push({
      category,
      title,
      text,
      keywords: keywords.map(normalize).filter(Boolean).join(' '),
      raw,
    });

  push('hotel', 'Hotel overview', toText(kb.property), [kb.property['Hotel Name'], 'overview', 'about']);
  push('hotel', 'Contact details', `Phone ${kb.property['Contact Phone']}. Email ${kb.property['Contact Email']}. WhatsApp ${kb.property['WhatsApp']}. Address ${kb.property.Address}.`, ['contact', 'phone', 'email', 'address', 'whatsapp', 'location']);

  for (const r of kb.rooms) {
    push('rooms', r.name, toText(r), [r.name, r.Type, r.Bed, r.View, r.Description, ...(r.Amenities || [])], r);
  }
  for (const a of kb.amenities) {
    push('amenities', a.name, toText(a), [a.name, a.Description, a.Location, a.Hours], a);
  }
  for (const d of kb.dining) {
    push('dining', d.name, toText(d), [d.name, d.Cuisine, d.Meals, d['Must Try'], d.Description], d);
  }
  for (const s of kb.services) {
    push('services', s.name, toText(s), [s.name, s.Description, s['How To Book']], s);
  }
  for (const n of kb.nearby) {
    push('nearby', n.name, toText(n), [n.name, n.Type, n.Description], n);
  }
  for (const f of kb.faqs) {
    push('faqs', f.question, `Q: ${f.question}\nA: ${f.answer}`, [f.question, f.answer], f);
  }
  for (const [key, value] of Object.entries(kb.policies)) {
    push('policies', `Policy: ${key}`, `${key}: ${value}`, [key, value]);
  }
  for (const e of kb.experiences || []) {
    push('experiences', e.name, toText(e), [e.name, e.Description, e.Location], e);
  }
  for (const ev of kb.events || []) {
    push('events', ev.name, toText(ev), [ev.name, ev.Description, ev.Location], ev);
  }
  for (const sp of kb.spa || []) {
    push('spa', sp.name, toText(sp), [sp.name, sp.Description], sp);
  }
  for (const se of kb.seasonal || []) {
    push('seasonal', se.name, toText(se), [se.name, se.Description, se.Period], se);
  }
  for (const sf of kb.safety || []) {
    push('safety', sf.name, toText(sf), [sf.name, sf.Description], sf);
  }
  for (const note of kb.notes || []) {
    push('rooms', 'General room notes', note, [note]);
  }
  return units;
}

const UNITS = buildUnits();

function scoreUnit(unit, queryTokens, queryNorm) {
  const titleNorm = normalize(unit.title);
  const textNorm = normalize(unit.text);
  const kwNorm = normalize(unit.keywords);
  const titleTokens = tokenize(unit.title);
  const kwTokens = tokenize(unit.keywords);
  let score = 0;

  // Strong bonus when the exact FAQ question appears in the user query.
  if (unit.category === 'faqs') {
    const qTokens = tokenize(unit.raw ? unit.raw.question : unit.title);
    const shared = queryTokens.filter((t) => qTokens.some((qt) => fuzzyMatch(t, qt))).length;
    if (qTokens.length && shared / qTokens.length >= 0.5) score += 8 + shared * 2;
  }

  const phraseNorm = normalize(unit.raw && unit.raw.question ? unit.raw.question : unit.title);
  if (phraseNorm.length > 8 && queryNorm.includes(phraseNorm)) score += 10;

  // Fuzzy token matching — tolerates 1-character typos
  for (const tok of queryTokens) {
    if (titleNorm.includes(tok)) { score += 3; continue; }
    if (kwNorm.includes(tok)) { score += 2; continue; }
    if (textNorm.includes(tok)) { score += 1; continue; }
    // Fuzzy: check title and keyword tokens for near-matches
    if (titleTokens.some((tt) => fuzzyMatch(tok, tt))) score += 2;
    else if (kwTokens.some((kt) => fuzzyMatch(tok, kt))) score += 1;
  }
  return score;
}

/**
 * Search the knowledge base and return ranked matches.
 * @returns {Array<{category:string,title:string,text:string,score:number}>}
 */
function search(query, { topK = 6 } = {}) {
  const qNorm = normalize(query);
  const qTokens = tokenize(query);
  if (!qTokens.length) return UNITS.slice(0, 2); // return some defaults even for empty query
  const ranked = UNITS.map((u) => ({ ...u, score: scoreUnit(u, qTokens, qNorm) }))
    .sort((a, b) => b.score - a.score);
  const filtered = ranked.filter((u) => u.score > 0);
  // Never return empty — if nothing matched, return top 2 by base relevance
  return (filtered.length ? filtered : ranked.slice(0, 2)).slice(0, topK);
}

/** Best FAQ match for a question, if strong enough. */
function findFaq(query) {
  const qTokens = tokenize(query);
  if (!qTokens.length) return null;
  const ranked = UNITS.filter((u) => u.category === 'faqs')
    .map((u) => ({ unit: u, score: scoreUnit(u, qTokens, normalize(query)) }))
    .sort((a, b) => b.score - a.score);
  if (ranked.length && ranked[0].score >= 6) return ranked[0].unit.raw;
  return null;
}

/** Grounded context for the LLM: top matches + sources, deduped by title. */
function getContext(query, { topK = 6 } = {}) {
  const matches = search(query, { topK });
  const seen = new Set();
  const units = [];
  const sources = [];
  for (const m of matches) {
    const key = `${m.category}:${m.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    units.push(m);
    sources.push({ category: m.category, title: m.title });
  }
  const text = units.map((u, i) => `[${i + 1}] ${u.title}\n${u.text}`).join('\n\n');
  return { text, sources };
}

/** Everything the assistant knows, as one text block (for system prompts / dumps). */
function getAllKnowledgeText() {
  const parts = [];
  parts.push(`# ${kb.property['Hotel Name']}`);
  parts.push(toText(kb.property));
  parts.push('## Rooms');
  kb.rooms.forEach((r) => parts.push(`${r.name}\n${toText(r)}`));
  parts.push('## Amenities');
  kb.amenities.forEach((a) => parts.push(`${a.name}\n${toText(a)}`));
  parts.push('## Dining');
  kb.dining.forEach((d) => parts.push(`${d.name}\n${toText(d)}`));
  parts.push('## Policies');
  parts.push(toText(kb.policies));
  parts.push('## Services');
  kb.services.forEach((s) => parts.push(`${s.name}\n${toText(s)}`));
  parts.push('## FAQ');
  kb.faqs.forEach((f) => parts.push(`Q: ${f.question}\nA: ${f.answer}`));
  parts.push('## Nearby');
  kb.nearby.forEach((n) => parts.push(`${n.name}\n${toText(n)}`));
  if (kb.experiences && kb.experiences.length) {
    parts.push('## Experiences');
    kb.experiences.forEach((e) => parts.push(`${e.name}\n${toText(e)}`));
  }
  if (kb.events && kb.events.length) {
    parts.push('## Events & Venues');
    kb.events.forEach((ev) => parts.push(`${ev.name}\n${toText(ev)}`));
  }
  if (kb.spa && kb.spa.length) {
    parts.push('## Spa Treatments');
    kb.spa.forEach((sp) => parts.push(`${sp.name}\n${toText(sp)}`));
  }
  if (kb.seasonal && kb.seasonal.length) {
    parts.push('## Seasonal Information');
    kb.seasonal.forEach((se) => parts.push(`${se.name}\n${toText(se)}`));
  }
  if (kb.safety && kb.safety.length) {
    parts.push('## Safety & Security');
    kb.safety.forEach((sf) => parts.push(`${sf.name}\n${toText(sf)}`));
  }
  return parts.join('\n\n');
}

/** One-stop lookup object used by tests. */
function getBookableFilters() {
  return {
    policyKeys: Object.keys(kb.policies),
    roomTypes: kb.rooms.map((r) => r.name),
    serviceNames: kb.services.map((s) => s.name),
    amenityNames: kb.amenities.map((a) => a.name),
  };
}

module.exports = { kb, search, findFaq, getContext, getAllKnowledgeText, getBookableFilters };