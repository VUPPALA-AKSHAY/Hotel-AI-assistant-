/**
 * Voice endpoints:
 *  - GET  /api/voice/config       -> Vapi widget config (public key + assistant id)
 *  - POST /api/voice/synthesize   -> ElevenLabs TTS audio proxied to the client
 *  - POST /api/voice/speak        -> alias of synthesize (legacy UI contract)
 *  - POST /api/voice/quick-chat   -> grounded chat reply for the voice modal
 */
const express = require('express');
const axios = require('axios');
const { logger } = require('../lib/logger');
const { createChatService } = require('./chat');

const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // "Sarah" (English)
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2'; // multilingual: en/hi/kn support

function createVoiceRouter({ tts, answer } = {}) {
  const router = express.Router();
  const client = tts || axios;
  const resolver = answer || createChatService({}).answer;

  router.get('/config', (req, res) => {
    res.json({
      publicKey: process.env.VAPI_PUBLIC_API_KEY || '',
      assistantId: process.env.VAPI_ASSISTANT_ID || '',
    });
  });

  const handleSynthesize = async (req, res) => {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ELEVENLABS_API_KEY is not configured' });
    }

    const voiceId = (req.body.voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID);
    const modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID;

    try {
      const ttsRes = await client.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text,
          model_id: modelId,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        },
        {
          headers: {
            'xi-api-key': apiKey,
            accept: 'audio/mpeg',
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 30000,
        }
      );
      res.set('Content-Type', ttsRes.headers['content-type'] || 'audio/mpeg');
      res.set('Cache-Control', 'no-store');
      res.send(Buffer.from(ttsRes.data));
    } catch (err) {
      logger.error('ElevenLabs TTS failed:', err.response?.data ? String(err.response.data).slice(0, 300) : err.message);
      res.status(502).json({ error: 'Could not synthesize speech. Please try again.' });
    }
  };

  router.post('/synthesize', handleSynthesize);
  router.post('/speak', handleSynthesize);

  router.post('/quick-chat', async (req, res) => {
    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim() || message.trim().length > 1000) {
      return res.status(400).json({ success: false, message: 'message must be a non-empty string (max 1000 chars)' });
    }

    try {
      const out = await resolver(message.trim(), history);
      res.json({ success: true, response: out.reply });
    } catch (err) {
      logger.error('voice quick-chat error:', err.message);
      res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
  });

  return router;
}

module.exports = { createVoiceRouter };