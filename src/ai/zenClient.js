/**
 * Opencode zen endpoint client.
 * All Opencode free models go through POST https://opencode.ai/zen/v1/chat/completions
 * with mandatory x-opencode-* headers. Generates fresh UUIDs per request.
 */
const axios = require('axios');
const crypto = require('crypto');
const { logger } = require('../lib/logger');
const { getModel } = require('./providers');

function opencodeLLM(modelId) {
  const cfg = getModel(modelId);
  if (!cfg) throw new Error(`Unknown model: ${modelId}`);

  return {
    /**
     * Non-streaming chat completion — returns the full reply string.
     */
    async chatCompletion({ messages, temperature = 0.4, maxTokens, timeout = 60000 }) {
      const headers = cfg.headers();
      const payload = {
        model: cfg.model,
        messages,
        temperature,
        max_tokens: maxTokens || cfg.maxTokens || 4096,
        stream: false,
      };
      let lastErr;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const { data } = await axios.post(cfg.baseURL, payload, { headers, timeout });
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

    /**
     * Streaming chat completion — yields text chunks as they arrive.
     */
    async *chatCompletionStream({ messages, temperature = 0.4, maxTokens, timeout = 60000 }) {
      const headers = cfg.headers();
      const payload = {
        model: cfg.model,
        messages,
        temperature,
        max_tokens: maxTokens || cfg.maxTokens || 4096,
        stream: true,
      };
      let lastErr;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await axios.post(cfg.baseURL, payload, {
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

module.exports = { opencodeLLM };
