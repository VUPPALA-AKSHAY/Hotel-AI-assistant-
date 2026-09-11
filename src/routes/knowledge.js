/**
 * GET /api/knowledge
 * Returns the hotel knowledge base for browser caching.
 * Also sets Cache-Control for Vercel edge caching (temp, 1h).
 */
const express = require('express');
const { kb, getAllKnowledgeText } = require('../hotel/knowledge');

const router = express.Router();

router.get('/', (req, res) => {
  // Allow browser to cache for 1 hour, Vercel edge for 1 hour
  res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=60');
  res.json({
    ok: true,
    property: kb.property,
    rooms: kb.rooms,
    amenities: kb.amenities,
    dining: kb.dining,
    policies: kb.policies,
    services: kb.services,
    faqs: kb.faqs,
    nearby: kb.nearby,
    experiences: kb.experiences || [],
    events: kb.events || [],
    spa: kb.spa || [],
    seasonal: kb.seasonal || [],
    safety: kb.safety || [],
    text: getAllKnowledgeText().slice(0, 50000),
    cachedAt: new Date().toISOString(),
  });
});

module.exports = router;
