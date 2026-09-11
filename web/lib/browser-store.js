/**
 * Browser-side local storage for all app data.
 * Namespaced under `gp-*` keys, versioned, with safe JSON handling.
 * Used for: hotel KB cache, chat history, prefs, temp session data.
 */
const PREFIX = 'gp-';
const VERSION = 'v1';

function key(name) {
  return `${PREFIX}${name}:${VERSION}`;
}

function safeParse(raw, fallback = null) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function get(name, fallback = null) {
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = localStorage.getItem(key(name));
    return raw ? safeParse(raw, fallback) : fallback;
  } catch {
    return fallback;
  }
}

function set(name, value) {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    localStorage.setItem(key(name), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(name) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.removeItem(key(name));
  } catch {}
}

// --- Typed helpers ---

// Hotel KB cache (from /api/knowledge or bundled JSON)
function getKbCache() {
  return get('kb-cache', null);
}
function setKbCache(data) {
  return set('kb-cache', { data, cachedAt: Date.now() });
}

// Chat history (sidebar + conversation)
function getChats() {
  return get('chats', []);
}
function setChats(chats) {
  return set('chats', chats);
}

// Session prefs
function getPrefs() {
  return get('prefs', {});
}
function setPrefs(prefs) {
  return set('prefs', prefs);
}

// Temp Vercel-like ephemeral cache in browser (with TTL)
function setTemp(keyName, value, ttlMs = 24 * 60 * 60 * 1000) {
  return set(`temp:${keyName}`, { value, expiresAt: Date.now() + ttlMs });
}
function getTemp(keyName) {
  const entry = get(`temp:${keyName}`, null);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    remove(`temp:${keyName}`);
    return null;
  }
  return entry.value;
}

export const browserStore = {
  get,
  set,
  remove,
  getKbCache,
  setKbCache,
  getChats,
  setChats,
  getPrefs,
  setPrefs,
  getTemp,
  setTemp,
  key,
};

export default browserStore;
