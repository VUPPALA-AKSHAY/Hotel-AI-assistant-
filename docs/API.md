# API Reference

Base URL: `http://localhost:3000/api` (the Next.js app proxies `/api/*` to this).

All JSON. Errors return `{ "error": "..." }` and, for validation, an `errors` array.

## `GET /api/health`

```bash
curl http://localhost:3000/api/health
```

```json
{ "ok": true, "service": "hotel-guest-assistant", "time": "2026-09-10T..." }
```

## `POST /api/chat`

Grounded chat answer. **Body:** `{ "message": string, "history": Array<{role:'user'|'assistant', content:string}>? }`

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Which room fits 3 guests?"}'
```

```json
{
  "reply": "The Seaview Balcony Room fits up to 3 guests...",
  "intent": "knowledge",
  "sources": [{ "category": "rooms", "title": "Seaview Balcony Room", "kind": "knowledge" }],
  "availability": null,
  "fallback": false
}
```

Availability example — returns structured room data under `availability`:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Is anything free on 2026-04-10 for 2 adults?"}'
```

```json
{
  "reply": "...",
  "intent": "availability",
  "sources": [ { "category": "rooms", "title": "Deluxe King Room", "kind": "knowledge" },
               { "category": "availability", "title": "Room availability", "kind": "availability" } ],
  "availability": {
    "ok": true,
    "nights": 2,
    "results": [
      { "roomId": "deluxe-king-room", "name": "Deluxe King Room", "type": "deluxe",
        "fits": true, "available": 4, "maxGuests": 2, "bed": "1 King Bed",
        "pricePerNight": 9500, "nights": 2, "totalPrice": 19000, "breakfastIncluded": true }
    ]
  },
  "fallback": false
}
```

## `POST /api/chat/stream`

Same logic, but responds as **Server-Sent Events**:

```
data: {"delta":"..."}
data: {"delta":"..."}
data: {"done":true,"sources":[...],"intent":"knowledge","availability":null}
```

```bash
curl -N -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"Do you have a spa?"}'
```

## `GET /api/availability`

Structured availability (no LLM) — used by the chat availability form.

```bash
curl "http://localhost:3000/api/availability?checkIn=2026-04-10&checkOut=2026-04-12&adults=2&children=0"
```

```json
{
  "ok": true,
  "nights": 2,
  "summary": "Rooms for 2 night(s):\n- Deluxe King Room ...",
  "results": [
    { "roomId": "deluxe-king-room", "name": "Deluxe King Room", "type": "deluxe",
      "fits": true, "available": 4, "maxGuests": 2, "bed": "1 King Bed", "size": "32 sq.m",
      "view": "Garden", "pricePerNight": 9500, "nights": 2, "totalPrice": 19000,
      "breakfastIncluded": true }
  ]
}
```

Validation (400 with `errors`): non-ISO dates, `checkOut ≤ checkIn`, stays > 30 nights,
non-integer adults (1–8) or children (0–6).

## `GET /api/voice/config`

Widget config for the browser (public values only — never the private key).

```bash
curl http://localhost:3000/api/voice/config
```

```json
{ "publicKey": "be566d96-...", "assistantId": "..." }
```

## `POST /api/voice/synthesize`

Proxies ElevenLabs TTS and streams back `audio/mpeg`.

```bash
curl -X POST http://localhost:3000/api/voice/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"Welcome to The Grand Palm"}' \
  --output welcome.mp3
```

## `GET /api/voice/config` → status codes quick reference

| Endpoint | 200 | 400 | 500/502 |
| --- | --- | --- | --- |
| `POST /api/chat` | grounded reply | bad/missing message | LLM failure → 200 with `fallback:true` (never a hard error) |
| `GET /api/availability` | room list | invalid booking params | — |
| `POST /api/voice/synthesize` | audio | missing `text` | missing API key (500) / ElevenLabs error (502) |
| `GET /api/unknown` | — | — | 404 `{error:"Not found"}` |