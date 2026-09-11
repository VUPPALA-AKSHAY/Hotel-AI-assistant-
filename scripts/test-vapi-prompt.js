#!/usr/bin/env node
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const prompt = fs.readFileSync('vapi-current-prompt.txt', 'utf8');

const questions = [
  'What time is check in and check out?',
  'How much is a Deluxe King Room per night?',
  'What are the check-in times?',
  'Is breakfast included?',
  'Do you have a swimming pool?',
  'What is the difference between Deluxe and Executive rooms?',
];

async function ask(q) {
  const res = await axios.post(
    (process.env.PRIMARY_BASE_URL + '/chat/completions').replace('//c', '/c'),
    {
      model: process.env.PRIMARY_MODEL,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: q },
      ],
      temperature: 0.4,
      max_tokens: 300,
    },
    { headers: { Authorization: `Bearer ${process.env.PRIMARY_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 }
  );
  return res.data.choices[0].message.content;
}

(async () => {
  for (const q of questions) {
    try {
      const a = (await ask(q)).trim();
      console.log('Q:', q);
      console.log('A:', a.slice(0, 300));
      console.log('---');
    } catch (e) {
      console.log('ERR for:', q, '->', e.response?.status || e.message);
    }
  }
})();