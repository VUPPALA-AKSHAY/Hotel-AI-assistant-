# Evaluation

How the assistant is evaluated against the assignment's expected behaviour. Every scenario below maps to one or more automated tests (`npm test`), plus a manual demo checklist.

## Test matrix (31 automated tests — all offline, LLM/TTS mocked)

| # | Scenario | Expected behaviour | Verified by |
| --- | --- | --- | --- |
| 1 | "What time is check-in?" | Grounded answer, `intent: knowledge`, sources returned | `tests/chat.test.js` |
| 2 | "Do you have a spa?" over SSE | Streamed reply, ends with `done:true` | `tests/chat.test.js` |
| 3 | "Is anything free on 2026-04-10 for 2 adults?" | `intent: availability`, validated room results | `tests/chat.test.js` |
| 4 | "Which room is good for 3 guests?" | Seaview Balcony injected into LLM context | `tests/chat.test.js` |
| 5 | Empty / 1000+ char message | `400` with clear error | `tests/chat.test.js` |
| 6 | LLM provider down | Deterministic fallback, `fallback:true` | `tests/chat.test.js` |
| 7 | Unrelated question ("open a bank account") | "I don't have that information… front desk" | `tests/chat.test.js` |
| 8 | Follow-up uses prior turn | History forwarded to the LLM call | `tests/chat.test.js` |
| 9 | Availability sorted by price, totals correct | Deluxe first; `pricePerNight × nights` | `tests/availability.test.js` |
| 10 | Same dates twice | Identical results (deterministic) | `tests/availability.test.js` |
| 11 | `checkOut ≤ checkIn` | `400` “checkOut must be after checkIn” | `tests/availability.test.js` |
| 12 | Non-numeric guests | `400` validation error | `tests/availability.test.js` |
| 13 | 8-adult party | All rooms flagged `fits:false` | `tests/availability.test.js` |
| 14 | Bad payload / stay > 30 nights | `ok:false`, no crash | `tests/availability.test.js` |
| 15 | Date parsing, ISO + adults/children | `2026-12-20`→`2026-12-24`, 2A1C | `tests/availability.test.js` |
| 16 | Date parsing, month names | "March 15 2026" → `2026-03-15` | `tests/availability.test.js` |
| 17 | "bestRoomForGuests(3)" | Seaview Balcony Room | `tests/availability.test.js` |
| 18 | Voice config | Public key + assistant id, never private key | `tests/voice.test.js` |
| 19 | TTS without text | `400` | `tests/voice.test.js` |
| 20 | TTS with text | Proxies ElevenLabs audio buffer | `tests/voice.test.js` |
| 21 | `/api/health` | `200 { ok: true }` | `tests/knowledge.test.js` |
| 22 | KB has rooms/policies/FAQs/services | Houses all expected entities | `tests/knowledge.test.js` |
| 23 | KB search | Finds "Check In Time" policy | `tests/knowledge.test.js` |
| 24 | FAQ matcher | Exact match for known question; `null` for unknown | `tests/knowledge.test.js` |
| 25 | Context + sources | Non-empty grounded text + source list | `tests/knowledge.test.js` |
| 26 | Full KB dump | Contains policies + rooms for system prompts | `tests/knowledge.test.js` |
| 27 | Unknown route | JSON `404 {error:"Not found"}` | `tests/knowledge.test.js` |

## Manual demo checklist

1. `npm run dev` → open http://localhost:3001; sidebar + rotating welcome questions render.
2. Click a suggestion chip → typing indicator → grounded answer **with source tags**.
3. Ask "Is anything free on 2026-04-10 for 2 adults?" → room cards with ₹/night, total, guests, availability badge.
4. Open the 📅 form in the input bar → pick dates/guests → cards update, text recap added to chat.
5. Hit 🔊 under a reply → ElevenLabs audio plays (needs a valid `ELEVENLABS_API_KEY`).
6. Hit 🎙️ or the floating button → voice modal; after `npm run create:vapi`, "Start call" opens a Vapi call.
7. Toggle theme; start a new chat; follow-up question ("what about breakfast?") keeps context.
8. Kill the network/LLM → assistant still answers from fallback (look for answers that cite "72 hours" etc.).
9. `git status` → `.env` must NOT be staged (git-ignored).

## Known limits (declared)

- The hotel is fictional; rates/occupancy are deterministic mock data, not a live PMS.
- ElevenLabs Kannada support depends on the model; the primary voice is English.
- Vapi assistant uses a generic voice-concierge prompt + KB snapshot, so it is not yet routed back through this API (future: transfer / LLM server-url).