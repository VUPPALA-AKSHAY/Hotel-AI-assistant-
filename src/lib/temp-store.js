/**
 * Server-side temp store for Vercel.
 * Uses Vercel KV (Upstash Redis) when env is present, otherwise in-memory Map with TTL.
 * Good for: session cache, LLM response cache, temp file metadata.
 * All keys are prefixed and auto-expire (default 24h).
 */
const PREFIX = 'gp:temp:';

let kv = null;
let kvAvailable = false;

// Lazy try to load @vercel/kv or @upstash/redis
try {
  // @vercel/kv re-exports Upstash client when KV env vars are set
  const maybeKv = require('@vercel/kv');
  if (maybeKv && maybeKv.kv) {
    // Check if env is configured (KV_REST_API_URL)
    if (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) {
      kv = maybeKv.kv;
      kvAvailable = true;
    }
  }
} catch (_) {
  try {
    const { Redis } = require('@upstash/redis');
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      kv = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      kvAvailable = true;
    }
  } catch (_) {
    kvAvailable = false;
  }
}

// In-memory fallback with TTL
const mem = new Map(); // key -> { value, expiresAt }

function memGet(key) {
  const entry = mem.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    mem.delete(key);
    return null;
  }
  return entry.value;
}
function memSet(key, value, ttlSec) {
  const expiresAt = ttlSec ? Date.now() + ttlSec * 1000 : null;
  mem.set(key, { value, expiresAt });
  if (ttlSec) {
    setTimeout(() => mem.delete(key), ttlSec * 1000 + 100).unref?.();
  }
}
function memDel(key) {
  mem.delete(key);
}

async function get(key) {
  const full = PREFIX + key;
  if (kvAvailable && kv) {
    try {
      const val = await kv.get(full);
      return val ?? null;
    } catch {
      return memGet(full);
    }
  }
  return memGet(full);
}

async function set(key, value, ttlSec = 24 * 60 * 60) {
  const full = PREFIX + key;
  if (kvAvailable && kv) {
    try {
      if (ttlSec) await kv.set(full, value, { ex: ttlSec });
      else await kv.set(full, value);
      return true;
    } catch {
      memSet(full, value, ttlSec);
      return true;
    }
  }
  memSet(full, value, ttlSec);
  return true;
}

async function del(key) {
  const full = PREFIX + key;
  if (kvAvailable && kv) {
    try {
      await kv.del(full);
    } catch {}
  }
  memDel(full);
}

function isKvEnabled() {
  return kvAvailable;
}

module.exports = { get, set, del, isKvEnabled };
