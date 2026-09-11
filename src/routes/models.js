/**
 * GET /api/models — returns available LLM models grouped by provider.
 * Frontend uses this to populate the model selector dropdown dynamically.
 */
const express = require('express');
const { listModels, DEFAULT_MODEL } = require('../ai/providers');

const router = express.Router();

router.get('/', (req, res) => {
  const models = listModels();
  // Group by category; null/empty → flat "Models" bucket
  const grouped = {};
  for (const m of models) {
    const key = m.category || 'Models';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  }
  res.json({ ok: true, defaultModel: DEFAULT_MODEL, models, grouped });
});

module.exports = router;
