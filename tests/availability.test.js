import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { checkAvailability, extractRequest, bestRoomForGuests, validateRequest } from '../src/hotel/availability';

const app = createApp({ llm: { async chatCompletion() { return 'ok'; } } });

describe('GET /api/availability', () => {
  it('returns rooms sorted by price with correct totals', async () => {
    const res = await request(app)
      .get('/api/availability')
      .query({ checkIn: '2026-04-10', checkOut: '2026-04-12', adults: 2 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.nights).toBe(2);
    const rooms = res.body.results;
    expect(rooms[0].name).toBe('Deluxe King Room');
    expect(rooms[0].totalPrice).toBe(rooms[0].pricePerNight * 2);
    for (let i = 1; i < rooms.length; i++) {
      expect(rooms[i].pricePerNight).toBeGreaterThanOrEqual(rooms[i - 1].pricePerNight);
    }
  });

  it('is deterministic across repeated calls for the same dates', async () => {
    const q = { checkIn: '2026-09-15', checkOut: '2026-09-17', adults: 3 };
    const a = await request(app).get('/api/availability').query(q);
    const b = await request(app).get('/api/availability').query(q);
    expect(JSON.stringify(a.body.results)).toBe(JSON.stringify(b.body.results));
  });

  it('returns 400 when the date range is invalid', async () => {
    const res = await request(app)
      .get('/api/availability')
      .query({ checkIn: '2026-01-05', checkOut: '2026-01-01', adults: 2 });
    expect(res.status).toBe(400);
    expect(res.body.errors).toContain('checkOut must be after checkIn');
  });

  it('returns 400 for non-numeric guests', async () => {
    const res = await request(app)
      .get('/api/availability')
      .query({ checkIn: '2026-01-01', checkOut: '2026-01-02', adults: 'many' });
    expect(res.status).toBe(400);
  });

  it('marks all rooms as not fitting for an 8-adult party', async () => {
    const res = await request(app)
      .get('/api/availability')
      .query({ checkIn: '2026-01-01', checkOut: '2026-01-02', adults: 8 });
    expect(res.status).toBe(200);
    expect(res.body.results.every((r) => r.fits === false)).toBe(true);
  });
});

describe('checkAvailability (unit)', () => {
  it('flags invalid payloads without throwing', () => {
    const r = checkAvailability({ checkIn: 'bad', checkOut: '2026-01-01', adults: 2 });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe('extractRequest (unit)', () => {
  it('extracts ISO date range, adults and children', () => {
    const req = extractRequest('2 adults and 1 child from 2026-12-20 to 2026-12-24');
    expect(req.checkIn).toBe('2026-12-20');
    expect(req.checkOut).toBe('2026-12-24');
    expect(req.adults).toBe(2);
    expect(req.children).toBe(1);
  });

  it('extracts English month-name dates', () => {
    const req = extractRequest('available March 15 2026 please');
    expect(req.checkIn).toBe('2026-03-15');
  });

  it('returns null when no date is present', () => {
    expect(extractRequest('tell me about the spa')).toBeNull();
  });
});

describe('validateRequest (unit)', () => {
  it('rejects a stay longer than the max nights', () => {
    const v = validateRequest({ checkIn: '2026-01-01', checkOut: '2026-03-01', adults: 2 });
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes('nights'))).toBe(true);
  });
});

describe('bestRoomForGuests (unit)', () => {
  it('suggests Seaview Balcony Room for 3 guests', () => {
    const room = bestRoomForGuests(3);
    expect(room).toBeTruthy();
    expect(room.name).toBe('Seaview Balcony Room');
  });
});