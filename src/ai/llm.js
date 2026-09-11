/**
 * Multi-model LLM router with automatic fallback.
 * Priority: user-selected model → other chat models → Hotel Agent (last resort).
 * If a model fails, silently falls back to the next available model.
 */
const axios = require('axios');
const { logger } = require('../lib/logger');
const { getModel, isValidModel, listModels, DEFAULT_MODEL } = require('./providers');
const { opencodeLLM } = require('./zenClient');

// Fallback chain: Ling (default) first, then other chat models, Hotel Agent last
const FALLBACK_ORDER = [
  DEFAULT_MODEL,
  'mimo-v2.5-free',
  'big-pickle',
  'muse-spark-1.2-contributor-free',
  'hotel-ai-agent',
];

function buildFallbackChain(preferredModelId) {
  const chain = [preferredModelId];
  for (const id of FALLBACK_ORDER) {
    if (id !== preferredModelId) chain.push(id);
  }
  return chain;
}

/**
 * Get an LLM client with automatic fallback.
 * Returns { llm, modelUsed } — the actual model that will be tried first.
 */
function getLLMForModel(modelId) {
  const id = modelId || DEFAULT_MODEL;
  const chain = buildFallbackChain(id);

  return {
    async chatCompletion({ messages, temperature = 0.4, maxTokens = 4096, timeout = 60000 }) {
      let lastErr;
      for (const modelId of chain) {
        try {
          const client = createClient(modelId);
          const result = await client.chatCompletion({ messages, temperature, maxTokens, timeout });
          if (modelId !== id) logger.info(`Fallback: ${id} failed → used ${modelId}`);
          return result;
        } catch (err) {
          lastErr = err;
          logger.warn(`Model ${modelId} failed: ${err.message}`);
        }
      }
      throw lastErr;
    },

    async *chatCompletionStream({ messages, temperature = 0.4, maxTokens = 4096, timeout = 60000 }) {
      let lastErr;
      for (const modelId of chain) {
        try {
          const client = createClient(modelId);
          yield* client.chatCompletionStream({ messages, temperature, maxTokens, timeout });
          if (modelId !== id) logger.info(`Fallback: ${id} failed → used ${modelId}`);
          return;
        } catch (err) {
          lastErr = err;
          logger.warn(`Model ${modelId} failed: ${err.message}`);
        }
      }
      throw lastErr;
    },
  };
}

function createClient(modelId) {
  if (!isValidModel(modelId)) return kiloLLM(modelId);
  const cfg = getModel(modelId);
  if (cfg.provider === 'Opencode') return opencodeLLM(modelId);
  return kiloLLM(modelId);
}

/**
 * Kilo gateway (or any OpenAI-compatible) LLM client.
 */
function kiloLLM(modelId) {
  return {
    async chatCompletion({ messages, temperature = 0.4, maxTokens = 4096, timeout = 60000 }) {
      const { endpoint, headers, payload } = buildKiloRequest({ modelId, messages, temperature, maxTokens });
      let lastErr;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const { data } = await axios.post(endpoint, payload, { headers, timeout });
          const content = data?.choices?.[0]?.message?.content;
          if (typeof content !== 'string' || !content.trim()) throw new Error('Empty LLM response (retry/fallback)');
          return content;
        } catch (err) {
          lastErr = err;
          const status = err.response?.status;
          const retryable = status === 429 || (status && status >= 500) || !status;
          if (!retryable || attempt === 3) break;
          await new Promise((r) => setTimeout(r, attempt * 800));
        }
      }
      throw lastErr;
    },

    async *chatCompletionStream({ messages, temperature = 0.4, maxTokens = 4096, timeout = 60000 }) {
      const { endpoint, headers, payload } = buildKiloRequest({ modelId, messages, temperature, maxTokens, stream: true });
      let lastErr;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await axios.post(endpoint, payload, {
            headers,
            timeout,
            responseType: 'stream',
          });
          let buffer = '';
          let gotContent = false;
          for await (const line of response.data) {
            buffer += line.toString();
            const parts = buffer.split('\n');
            buffer = parts.pop();
            for (const part of parts) {
              const trimmed = part.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const jsonStr = trimmed.slice(6);
              if (jsonStr === '[DONE]') {
                if (!gotContent) throw new Error('Stream ended with no content');
                return;
              }
              try {
                const parsed = JSON.parse(jsonStr);
                const delta = parsed?.choices?.[0]?.delta || parsed?.choices?.[0]?.message || parsed;
                const content = (typeof delta?.content === 'string' && delta.content.trim()) ? delta.content : '';
                if (content) { gotContent = true; yield content; }
              } catch { /* skip malformed */ }
            }
          }
          return;
        } catch (err) {
          lastErr = err;
          const status = err.response?.status;
          const retryable = status === 429 || (status && status >= 500) || !status;
          if (!retryable || attempt === 3) break;
          await new Promise((r) => setTimeout(r, attempt * 800));
        }
      }
      throw lastErr;
    },
  };
}

function buildKiloRequest({ modelId, messages, temperature = 0.4, maxTokens, stream = false }) {
  const cfg = getModel(modelId);
  let endpoint, headers, model;

  if (cfg && cfg.baseURL) {
    endpoint = typeof cfg.baseURL === 'function' ? cfg.baseURL() : cfg.baseURL;
    headers = cfg.headers();
    model = cfg.model;
  } else {
    const key = process.env.PRIMARY_API_KEY;
    const base = process.env.PRIMARY_BASE_URL || 'https://api.kilo.ai/api/gateway';
    endpoint = `${base.replace(/\/+$/, '')}/chat/completions`;
    headers = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = `Bearer ${key}`;
    model = modelId || process.env.PRIMARY_MODEL || 'stepfun/step-3.7-flash:free';
  }

  const tokens = maxTokens || cfg?.maxTokens || 4096;
  const payload = { model, messages, temperature, max_tokens: tokens };
  if (stream) payload.stream = true;
  return { endpoint, headers, payload };
}

// Backward compat: systemLLM() returns the default chat client (Ling 3.0 Flash first)
function systemLLM() {
  return getLLMForModel();
}

module.exports = { systemLLM, getLLMForModel, isValidModel, logger };
