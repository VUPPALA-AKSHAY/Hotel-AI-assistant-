#!/usr/bin/env node
/**
 * Hotel Guest Assistant - API server.
 * Run `node server.js` (or `npm run dev:api`).
 */
require('dotenv').config();
const { createApp } = require('./src/app');
const { logger } = require('./src/lib/logger');

const port = Number(process.env.PORT || 3000);
const app = createApp();

app.listen(port, () => {
  logger.info(`Hotel Guest Assistant API listening on http://localhost:${port}`);
  logger.info(`Health check: http://localhost:${port}/api/health`);
});