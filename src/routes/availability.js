/**
 * GET /api/availability?checkIn=&checkOut=&adults=&children=
 * Structured, deterministic availability lookup (no LLM) - used by the UI form.
 */
const express = require('express');
const { checkAvailability, formatAvailability } = require('../hotel/availability');

const router = express.Router();

router.get('/', (req, res) => {
  const result = checkAvailability({
    checkIn: req.query.checkIn,
    checkOut: req.query.checkOut,
    adults: req.query.adults,
    children: req.query.children,
  });

  if (!result.ok) {
    return res.status(400).json({ error: 'Invalid booking request', errors: result.errors });
  }

  const summary = formatAvailability(result);
  res.json({ ok: true, nights: result.nights, summary, results: result.results });
});

module.exports = router;