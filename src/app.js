/**
 * Express application factory. Created per-process with optional injected LLM
 * (used by tests to substitute a mock). Never calls app.listen here.
 */
const express = require('express');
const cors = require('cors');

const { logger } = require('./lib/logger');
const { createChatRouter, createChatService } = require('./routes/chat');
const availabilityRouter = require('./routes/availability');
const { createVoiceRouter } = require('./routes/voice');
const knowledgeRouter = require('./routes/knowledge');
const blobRouter = require('./routes/blob');
const modelsRouter = require('./routes/models');

function createApp({ llm, tts } = {}) {
  const app = express();
  const chatService = createChatService({ llm });

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    res.on('finish', () => {
      logger.info(`${req.method} ${req.originalUrl} -> ${res.statusCode}`);
    });
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'hotel-guest-assistant', time: new Date().toISOString() });
  });

  app.use('/api/chat', createChatRouter({ llm, service: chatService }));
  app.use('/api/availability', availabilityRouter);
  app.use('/api/voice', createVoiceRouter({ tts, answer: chatService.answer }));
  app.use('/api/knowledge', knowledgeRouter);
  app.use('/api/blob', blobRouter);
  app.use('/api/models', modelsRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.originalUrl });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err.message);
    res.status(err.status || 500).json({
      error: err.expose ? err.message : 'Internal server error',
    });
  });

  return app;
}

module.exports = { createApp };