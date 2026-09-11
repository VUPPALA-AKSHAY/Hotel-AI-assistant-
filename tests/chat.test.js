import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

function appWith(mock) {
  return createApp({ llm: mock });
}

const warmLLM = {
  async chatCompletion({ messages }) {
    const last = messages[messages.length - 1].content;
    return `Grounded reply about: "${last}"`;
  },
  async *chatCompletionStream({ messages }) {
    const last = messages[messages.length - 1].content;
    yield `Grounded reply about: "${last}"`;
  },
};

describe('POST /api/chat', () => {
  it('answers a knowledge question with grounded reply and sources', async () => {
    const res = await request(appWith(warmLLM)).post('/api/chat').send({ message: 'What time is check-in?' });
    expect(res.status).toBe(200);
    expect(res.body.reply).toContain('Grounded reply');
    expect(res.body.intent).toBe('knowledge');
    expect(res.body.sources.length).toBeGreaterThan(0);
    expect(res.body.sources[0].kind).toBe('knowledge');
  });

  it('detects availability intent when dates are included', async () => {
    const res = await request(appWith(warmLLM))
      .post('/api/chat')
      .send({ message: 'Is anything free on 2026-04-10 for 2 adults?' });
    expect(res.status).toBe(200);
    expect(res.body.intent).toBe('availability');
    expect(res.body.availability.ok).toBe(true);
    expect(res.body.availability.results.length).toBeGreaterThan(0);
  });

  it('suggests the Seaview Balcony Room when the guest asks about 3 guests', async () => {
    let system = '';
    const spy = {
      async chatCompletion({ messages }) {
        system = messages[0].content;
        return 'ok';
      },
      async *chatCompletionStream({ messages }) {
        system = messages[0].content;
        yield 'ok';
      },
    };
    await request(appWith(spy)).post('/api/chat').send({ message: 'Which room is good for 3 guests?' });
    expect(system).toContain('Seaview Balcony Room');
    expect(system).toContain('KNOWLEDGE');
  });

  it('returns 400 for an empty message', async () => {
    const res = await request(appWith(warmLLM)).post('/api/chat').send({ message: '   ' });
    expect(res.status).toBe(400);
  });

  it('falls back deterministically when the LLM fails', async () => {
    const broken = { async chatCompletion() { throw new Error('LLM down'); }, async *chatCompletionStream() { throw new Error('LLM down'); } };
    const res = await request(appWith(broken))
      .post('/api/chat')
      .send({ message: 'What is the cancellation policy?' });
    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe(true);
    expect(res.body.reply).toContain('72 hours');
  });

  it('does not invent facts when nothing matches (graceful i-dont-know)', async () => {
    const broken = { async chatCompletion() { throw new Error('LLM down'); }, async *chatCompletionStream() { throw new Error('LLM down'); } };
    const res = await request(appWith(broken))
      .post('/api/chat')
      .send({ message: 'Can you open a bank account for me?' });
    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe(true);
    expect(res.body.reply.toLowerCase()).toMatch(/help|assist|look into|more detail/);
  });

  it('carries conversation history into the LLM call', async () => {
    let received = null;
    const spy = {
      async chatCompletion({ messages }) {
        received = messages;
        return 'ok';
      },
      async *chatCompletionStream({ messages }) {
        received = messages;
        yield 'ok';
      },
    };
    await request(appWith(spy))
      .post('/api/chat')
      .send({
        message: 'What about breakfast?',
        history: [{ role: 'user', content: 'Do you have a pool?' }],
      });
    expect(received.some((m) => m.content === 'Do you have a pool?')).toBe(true);
    expect(received[received.length - 1].content).toBe('What about breakfast?');
  });

  it('rejects overly long messages', async () => {
    const res = await request(appWith(warmLLM)).post('/api/chat').send({ message: 'a'.repeat(1001) });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/chat/stream', () => {
  it('streams an SSE reply and terminates with done', async () => {
    const res = await request(appWith(warmLLM))
      .post('/api/chat/stream')
      .send({ message: 'Do you have a spa?' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('data: ');
    expect(res.text).toContain('"done":true');
  });
});