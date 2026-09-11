# Architecture

## High level

```
┌────────────┐   fetch() via Next rewrites ──┐   ┌──────────────────────────────┐
│ Next.js UI │   /api/* → :3000/api/*        │   │       Express API (:3000)     │
│  (:3001)   │ ──────────────────────────────▶ │                              │
└─────┬──────┘                               │   │  /api/chat      chat.js      │
      │ chat POST + SSE                       │   │  /api/availability  util.js │
      │ availability GET                      │   │  /api/voice      voice.js    │
      │ voice synthesize / config             │   │  /api/health                │
      │                                       │   └────────────┬───────────────┘
      │  Vapi SDK (browser) ─┐                │                │
      │  ElevenLabs audio ◀──┼── audio/mpeg ──┘                │
      │                      │                                ▼
      ▼                      │               ┌──────────────────────────────────┐
┌─────────────┐              │               │         Hotel Knowledge          │
│ Vapi        │  ────────────┘               │ hotel-knowledge.json (from MD)   │
│ assistant   │                              │ knowledge.js  (search/context)   │
└─────────────┘   phone-style call            │ availability.js (dates/inventory)│
                                              └───────────┬──────────────────────┘
                                                          ▼
                                              ┌──────────────────────────────────┐
                                              │         External services        │
                                              │ Kilo free gateway (chat) · ElevenLabs TTS │
                                              └──────────────────────────────────┘
```

## Request lifecycle — `POST /api/chat`

1. **Validate** the message (non-empty, ≤ 1000 chars).
2. **Retrieve context** — `knowledge.getContext(message)` ranks KB units (rooms, amenities, dining, policies, FAQs, services, nearby) by token overlap and phrase matching; returns a grounded `text` block + `sources`.
3. **Intent detection**:
   - **availability** → if the message has dates + stays/rooms vocabulary, `availability.extractRequest()` pulls `{checkIn, checkOut, adults, children}`, then `checkAvailability(...)` computes deterministic occupancy from `inventory.json`.
   - **guest-count** → e.g. "which room fits 3 guests" injects the best-fit room fact into context.
   - otherwise → **knowledge**.
4. **Compose messages** — system prompt (rules + knowledge + availability block) + recent history (≤ 8 turns) + user message.
5. **Call LLM** (Kilo free gateway, no key). On any failure the route **falls back to a deterministic reply** built directly from KB/availability so the assistant never goes dark.
6. **Respond** with `{ reply, intent, sources, availability, fallback }`; `/stream` variant emits the same payload over SSE.

## Why deterministic availability?

No stock/booking API exists for the fictional hotel. Instead of wiring a live database, availability is computed **deterministically**:

```
seed = hash(`${checkIn}|${roomName}`)
occupied = floor(totalRooms * (0.28 + seed01 * 0.55))
```

Same dates + room ⇒ same result, every time. That makes tests stable and the UX believable, while the architecture (a pure function returning room/price/occupancy objects) is trivially swappable for a real bookings table later.

## Dependency injection for tests

`createApp({ llm, tts })` accepts injectable clients:

- `llm.chatCompletion({ messages, temperature, maxTokens })` → string
- `tts.post(url, body, config)` → axios-shaped response

Tests provide mock implementations, so the entire suite runs offline with zero network calls and no API keys.

## Configuration (`.env`)

| Key | Use |
| --- | --- |
| `PRIMARY_API_KEY` / `PRIMARY_BASE_URL` / `PRIMARY_MODEL` | OpenAI-compatible chat (default: Kilo free gateway, no key required) |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL_ID` | TTS |
| `VAPI_PRIVATE_API_KEY` | server-only, for creating assistant + dashboard |
| `VAPI_PUBLIC_API_KEY` / `VAPI_ASSISTANT_ID` | served by `/api/voice/config` to the browser |
| `PORT` | API port (3000) |

Frontend reads only `NEXT_PUBLIC_*` values from `web/.env.local`; rewrites proxy `/api/*` to the Express server so the browser never talks to external origins directly.