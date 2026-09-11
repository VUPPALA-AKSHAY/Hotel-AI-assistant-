import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp({ llm: { async chatCompletion() { return 'ok'; } } });

describe('GET /api/voice/config', () => {
  const old = { pub: process.env.VAPI_PUBLIC_API_KEY, asst: process.env.VAPI_ASSISTANT_ID };

  beforeEach(() => {
    process.env.VAPI_PUBLIC_API_KEY = 'pub-test';
    process.env.VAPI_ASSISTANT_ID = 'asst-test';
  });

  afterEach(() => {
    process.env.VAPI_PUBLIC_API_KEY = old.pub;
    process.env.VAPI_ASSISTANT_ID = old.asst;
    vi.restoreAllMocks();
  });

  it('exposes public key and assistant id (never the private key)', async () => {
    const res = await request(app).get('/api/voice/config');
    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBe('pub-test');
    expect(res.body.assistantId).toBe('asst-test');
    expect(JSON.stringify(res.body)).not.toContain(process.env.VAPI_PRIVATE_API_KEY);
  });
});

describe('POST /api/voice/synthesize', () => {
  const oldKey = process.env.ELEVENLABS_API_KEY;

  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';
  });

  afterEach(() => {
    process.env.ELEVENLABS_API_KEY = oldKey;
    vi.restoreAllMocks();
  });

  function voiceApp() {
    const tts = { post: vi.fn() };
    return { app: createApp({ llm: { async chatCompletion() { return 'ok'; } }, tts }), tts };
  }

  it('rejects requests without text', async () => {
    const res = await request(app).post('/api/voice/synthesize').send({});
    expect(res.status).toBe(400);
  });

  it('proxies ElevenLabs audio when text is provided', async () => {
    const { app: vApp, tts } = voiceApp();
    tts.post.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
      data: Buffer.from('MP3DATA'),
    });
    const res = await request(vApp).post('/api/voice/synthesize').send({ text: 'Hello' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
    expect(res.body.toString()).toContain('MP3DATA');
    expect(tts.post).toHaveBeenCalledTimes(1);
    expect(tts.post.mock.calls[0][0]).toContain('api.elevenlabs.io');
  });
});