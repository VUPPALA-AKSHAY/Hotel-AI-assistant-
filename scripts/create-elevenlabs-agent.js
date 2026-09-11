#!/usr/bin/env node
require('dotenv').config();
const axios = require('axios');
const { getAllKnowledgeText } = require('../src/hotel/knowledge');

async function main() {
  const kb = getAllKnowledgeText();
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) { console.error('Missing ELEVENLABS_API_KEY'); process.exit(1); }

  const prompt = [
    'You are the voice concierge of "The Grand Palm" hotel speaking over the phone.',
    'Be warm, concise, and helpful. Keep answers under 3-4 sentences for voice.',
    'Answer ONLY from the hotel data below. If the answer is not in the data, say:',
    '"I don\'t have that information - please call the front desk for help."',
    'Never invent prices, policies or facilities. Speak naturally like a real person.',
    '',
    '===== HOTEL DATA =====',
    kb,
  ].join('\n');

  console.log('Creating ElevenLabs Conversational AI agent...');
  const res = await axios.post('https://api.elevenlabs.io/v1/convai/agents/create', {
    name: 'Hotel Concierge - The Grand Palm',
    conversation_config: {
      agent: {
        first_message: 'Hello! Welcome to The Grand Palm. How can I help you today?',
        language: 'en',
        prompt: {
          prompt: prompt,
          llm: 'gemini-2.0-flash',
          temperature: 0.4,
        },
      },
      tts: {
        voice_id: 'EXAVITQu4vr4xnSDxMaL',
        model_id: 'eleven_flash_v2_5',
      },
      conversation: {
        max_duration_seconds: 300,
      },
    },
  }, {
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  console.log('Agent created!');
  console.log('AGENT_ID:', res.data.agent_id);
  console.log('Name:', res.data.name);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Set ELEVENLABS_AGENT_ID=' + res.data.agent_id + ' in .env');
  console.log('  2. Set NEXT_PUBLIC_ELEVENLABS_AGENT_ID=' + res.data.agent_id + ' in web/.env.local');
}

main().catch((err) => {
  console.error('Failed:', JSON.stringify(err.response?.data || err.message));
  process.exit(1);
});
