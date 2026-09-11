/**
 * POST /api/blob/upload - temporary file storage via Vercel Blob (falls back to local echo)
 * GET  /api/blob/list   - list blobs (when Blob is configured)
 * Uses @vercel/blob when BLOB_READ_WRITE_TOKEN is set, otherwise in-memory.
 */
const express = require('express');
const { logger } = require('../lib/logger');

const router = express.Router();

// In-memory fallback for local dev without Blob
const memBlobs = new Map();

// POST /api/blob/upload { filename, content } -> stores in Vercel Blob with 24h cache
router.post('/upload', express.json({ limit: '5mb' }), async (req, res) => {
  const { filename, content, contentType } = req.body || {};
  if (!filename || !content) return res.status(400).json({ error: 'filename and content required' });

  // Try Vercel Blob
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = require('@vercel/blob');
      const blob = await put(`tmp/${Date.now()}-${filename}`, Buffer.from(content, 'base64'), {
        access: 'public',
        contentType: contentType || 'application/octet-stream',
        addRandomSuffix: false,
      });
      logger.info(`Blob uploaded: ${blob.url}`);
      return res.json({ ok: true, url: blob.url, via: 'vercel-blob', temporary: true });
    } catch (err) {
      logger.warn('Blob put failed, falling back to mem:', err.message);
    }
  }

  // Fallback: store in memory (ephemeral, for local dev)
  const id = `mem-${Date.now()}-${filename}`;
  memBlobs.set(id, { filename, content, contentType, createdAt: Date.now() });
  // Auto-expire after 24h
  setTimeout(() => memBlobs.delete(id), 24 * 60 * 60 * 1000).unref?.();
  res.json({ ok: true, url: `memory://${id}`, via: 'memory', temporary: true, note: 'Set BLOB_READ_WRITE_TOKEN for Vercel Blob' });
});

router.get('/list', async (req, res) => {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { list } = require('@vercel/blob');
      const { blobs } = await list({ prefix: 'tmp/' });
      return res.json({ ok: true, via: 'vercel-blob', count: blobs.length, blobs: blobs.slice(0, 20) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  res.json({ ok: true, via: 'memory', count: memBlobs.size, blobs: Array.from(memBlobs.keys()).slice(0, 20) });
});

module.exports = router;
