import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { kb, search, findFaq, getContext, getBookableFilters } from '../src/hotel/knowledge';
import { getAllKnowledgeText } from '../src/hotel/knowledge';

const app = createApp({ llm: { async chatCompletion() { return 'ok'; } } });

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('knowledge base integrity', () => {
  it('contains rooms, policies, faqs and services', () => {
    expect(getBookableFilters().roomTypes).toContain('Deluxe King Room');
    expect(getBookableFilters().roomTypes).toContain('Presidential Suite');
    expect(getBookableFilters().policyKeys).toContain('Cancellation Policy');
    expect(getBookableFilters().policyKeys).toContain('Check In Time');
    expect(getBookableFilters().serviceNames).toContain('Airport Transfer');
    expect(getBookableFilters().amenityNames).toContain('Lagoon Swimming Pool');
  });

  it('search finds the check-in policy', async () => {
    const hits = search('When can I check in?', { topK: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.title.includes('Check In Time'))).toBe(true);
  });

  it('findFaq returns an exact FAQ match for known questions', () => {
    const faq = findFaq('What time is check-in?');
    expect(faq).toBeTruthy();
    expect(faq.answer).toContain('3:00 PM');
  });

  it('findFaq returns null for unknown questions', () => {
    expect(findFaq('open a bank account please')).toBeNull();
  });

  it('getContext returns grounded text plus sources', () => {
    const { text, sources } = getContext('does the hotel have a swimming pool?', { topK: 3 });
    expect(text.length).toBeGreaterThan(0);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources[0]).toHaveProperty('category');
  });

  it('full knowledge dump contains the cancellation policy', () => {
    const full = getAllKnowledgeText();
    expect(full).toContain('Free cancellation until 72 hours');
    expect(full).toContain('Seaview Balcony Room');
  });
});

describe('404 handling', () => {
  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/definitely-not-real');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});