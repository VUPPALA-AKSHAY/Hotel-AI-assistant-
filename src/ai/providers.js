/**
 * Model registry — maps model IDs to provider configs.
 * Opencode free models all go through the same zen endpoint.
 * Kilo free gateway is the fallback (hotel-ai-agent).
 * Ling 3.0 Flash (ling-3.0-flash-fin-free) is the app default.
 */
const crypto = require('crypto');

const OPENCODE_ENDPOINT = 'https://opencode.ai/zen/v1/chat/completions';

// Default chat model (Ling 3.0 Flash)
const DEFAULT_MODEL = 'ling-3.0-flash-fin-free';
const OPENCODE_HEADERS = {
  'Authorization': 'Bearer public',
  'Content-Type': 'application/json',
  'User-Agent': 'opencode/1.18.30',
  'x-opencode-client': 'pentestcode',
};

const MODELS = {
  'mimo-v2.5-free': {
    name: 'MiMo V2.5',
    provider: 'Opencode',
    category: null,
    description: 'Fast, versatile model',
    maxTokens: 4096,
    baseURL: OPENCODE_ENDPOINT,
    headers: () => ({
      ...OPENCODE_HEADERS,
      'x-opencode-session': crypto.randomUUID(),
      'x-opencode-request': crypto.randomUUID(),
    }),
    model: 'mimo-v2.5-free',
    free: true,
  },
  'muse-spark-1.2-contributor-free': {
    name: 'Muse Spark 1.2',
    provider: 'Opencode',
    category: null,
    description: 'Current assistant model',
    maxTokens: 4096,
    baseURL: OPENCODE_ENDPOINT,
    headers: () => ({
      ...OPENCODE_HEADERS,
      'x-opencode-session': crypto.randomUUID(),
      'x-opencode-request': crypto.randomUUID(),
    }),
    model: 'muse-spark-1.2-contributor-free',
    free: true,
  },
  'ling-3.0-flash-fin-free': {
    name: 'Ling 3.0 Flash',
    provider: 'Opencode',
    category: null,
    description: 'Ultra-fast flash model',
    maxTokens: 4096,
    baseURL: OPENCODE_ENDPOINT,
    headers: () => ({
      ...OPENCODE_HEADERS,
      'x-opencode-session': crypto.randomUUID(),
      'x-opencode-request': crypto.randomUUID(),
    }),
    model: 'ling-3.0-flash-fin-free',
    free: true,
  },
  'big-pickle': {
    name: 'Big Pickle',
    provider: 'Opencode',
    category: null,
    description: 'Powerful model',
    maxTokens: 4096,
    baseURL: OPENCODE_ENDPOINT,
    headers: () => ({
      ...OPENCODE_HEADERS,
      'x-opencode-session': crypto.randomUUID(),
      'x-opencode-request': crypto.randomUUID(),
    }),
    model: 'big-pickle',
    free: true,
  },
  'hotel-ai-agent': {
    name: 'Hotel Agent',
    provider: 'Kilo',
    category: null,
    description: 'Grand Palm Assistant',
    maxTokens: 4096,
    baseURL: (process.env.PRIMARY_BASE_URL || 'https://api.kilo.ai/api/gateway').replace(/\/+$/, '') + '/chat/completions',
    headers: () => {
      const h = { 'Content-Type': 'application/json' };
      const key = process.env.PRIMARY_API_KEY;
      if (key) h['Authorization'] = `Bearer ${key}`;
      return h;
    },
    model: process.env.PRIMARY_MODEL || 'nex-agi/nex-n2.5-mini:free',
    free: true,
  },
};

function getModel(modelId) {
  return MODELS[modelId] || null;
}

function listModels() {
  return Object.entries(MODELS).map(([id, cfg]) => ({
    id,
    name: cfg.name,
    provider: cfg.provider,
    category: cfg.category,
    description: cfg.description,
    free: cfg.free,
  }));
}

function isValidModel(modelId) {
  return modelId in MODELS;
}

module.exports = { getModel, listModels, isValidModel, DEFAULT_MODEL, OPENCODE_ENDPOINT, OPENCODE_HEADERS };
