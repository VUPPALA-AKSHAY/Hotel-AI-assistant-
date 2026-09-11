#!/usr/bin/env node
/**
 * Creates the "Hotel Concierge" voice assistant on Vapi via its REST API.
 * Uses the private key from .env (VAPI_PRIVATE_API_KEY).
 *
 * Run: node scripts/create-vapi-assistant.js
 *      (or `npm run create:vapi`)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const VAPI_API = 'https://api.vapi.ai/assistant';
const PRIVATE_KEY = process.env.VAPI_PRIVATE_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

const { getAllKnowledgeText } = require('../src/hotel/knowledge');

async function main() {
  if (!PRIVATE_KEY) {
    console.error('Missing VAPI_PRIVATE_API_KEY in .env. Add it and re-run.');
    process.exit(1);
  }

  const payload = {
    name: 'Hotel Concierge — The Grand Palm',
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.4,
      systemPrompt: [
        `You are the voice concierge of "The Grand Palm" speaking over the phone. Be warm, friendly, concise and helpful. Keep answers to 1-3 short sentences for voice.`,
        '',
        'How to answer:',
        '0. For greetings and small talk, respond warmly like a real friendly concierge. Always bring the conversation back to how you can help.',
        '1. Answer ONLY from the data below. Quote exact numbers and prices from the data. If the answer is not in the data, say: "I don\'t have that information — please call the front desk for help." Never invent prices, policies or facilities.',
        '2. If the guest speaks Hindi, Telugu, Kannada or another language, reply in that language while still using the hotel data.',
        '3. For comparison questions like "difference between X and Y", compare the two entries from the data (price, size, bed, amenities).',
        '',
        'AVAILABILITY & ROOM REQUESTS:',
        '- Treat these as valid dates without pressing for more: "tomorrow", "next week", "next month", "tonight", or any month name like "October". A checkout date is NOT needed.',
        '- Accept guest counts, room counts, and party sizes in any form: "10 guests", "5 rooms", "for 2 people", "family of 4".',
        '- When the guest gives a guest count, recommend the rooms that FIT that party using the room Max Guests / beds in the data. Do NOT read back demands like "exact check-in/check-out dates, room mix, or 2 guests per room".',
        '- Ask at most ONE short follow-up question for truly missing details, and only when needed.',
        '',
        'COMPOUND QUESTIONS:',
        '- If the guest asks multiple things at once, answer ALL parts in one reply. Never ask them to repeat or split the question.',
        '',
        'ROOM TYPE PREFERENCES:',
        '- If the guest mentions words like "luxury", "premium", "high budget", "top", "suite", "budget", "cheap", "affordable", "low budget", "economy", "basic", "mid", "mid-range", "medium budget", "decent", "family", "kids", "business", "view", "sea view", map them to the matching room type (e.g. luxury/premium/high-end → Presidential Suite or Seaview Balcony; budget/cheap/low budget → Deluxe King; mid/medium → Seaview Balcony or Deluxe King; family/kids → Family Suite). Always present the best-fitting room type first.',
        '',
        '===== HOTEL DATA =====',
        getAllKnowledgeText().slice(0, 30000),
      ].join('\n'),
    },
    voice: {
      provider: '11labs',
      voiceId: VOICE_ID,
      model: 'eleven_multilingual_v2',
    },
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'en',
    },
    firstMessage: 'Hello, welcome to The Grand Palm. I can help you with rooms, amenities, dining, policies, and availability. How can I assist you today?',
  };

  console.log(`Creating "Hotel Concierge" on Vapi (voice: ${VOICE_ID})...`);
  const { data } = await axios.post(VAPI_API, payload, {
    headers: {
      Authorization: `Bearer ${PRIVATE_KEY}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  const assistantId = data.id;
  console.log(`✓ Assistant created → id: ${assistantId}`);
  console.log(`  Name: ${data.name || payload.name}`);
  console.log(`  Link: https://dashboard.vapi.ai/assistant/${assistantId}`);

  // Help the user wire it up.
  console.log('\nNext steps:');
  console.log(`  1. Set VAPI_ASSISTANT_ID=${assistantId} in your .env (server)`);
  console.log(`  2. Set NEXT_PUBLIC_VAPI_ASSISTANT_ID=${assistantId} in web/.env.local (frontend)`);
  console.log('  3. Restart the dev servers and the voice call button will go live.');
}

main().catch((err) => {
  console.error('Failed to create assistant:', err.response?.data || err.message);
  process.exit(1);
});