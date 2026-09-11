# Product & AI Decisions

This document records every meaningful product/AI decision made while building the assistant, alongside the rationale. It is written so an evaluator can see *why* the system is shaped the way it is.

## 1. Knowledge base is Markdown → JSON, and is the only source of truth

**Decision:** Author hotel facts in `src/hotel/hotel-knowledge.md`, compile to `hotel-knowledge.json` with `npm run build:knowledge`.

**Why:** Markdown is human-editable and reviewable by a client ("give me a .md knowledge base"); JSON is machine-usable at runtime without extra dependencies. Keeping a compile step enforces that the KB is validated (parse errors fail the build) and versionable via git.

## 2. Grounded-only answering (no hallucinations, no web, no general knowledge)

**Decision:** The system prompt instructs the model to answer *only from* the retrieved knowledge block and the availability results, and to offer the front desk when data is missing. A deterministic fallback path even answers without the LLM.

**Why:** A hotel assistant that invents a rate, a policy, or tells a guest about a fictional facility is a liability. Grounded retrieval (ranked KB context + source attribution in the UI) makes every answer traceable. "I don't know → call front desk" is deliberately part of the product, not an edge case.

## 3. Concierge answers only hotel facts

**Decision:** The assistant answers only from the hotel knowledge base and the deterministic availability engine, through a single OpenAI-compatible LLM route with automatic model fallback.

**Why:** One deterministic-plus-LLM pipeline is simpler to test and document, and avoids the inconsistency of juggling multiple LLM providers.

## 4. Deterministic availability + deterministic intent extraction

**Decision:** Dates, guest counts, validation, occupancy, FIT-checks, and pricing/totals are computed in pure functions (`availability.js`). Natural-language dates support ISO and English month names.

**Why:** Chat LLMs are poor at arithmetic and can change answers between calls. By making availability deterministic (seeded from `checkIn|room` so same dates ⇒ same result), the UI and tests are stable, totals are always correct, and the fictional hotel behaves believably. A real PMS can later replace only this pure module.

## 5. Availability is part of the DB, not hardcoded in each answer

**Decision:** Room types/capacities/prices live in the knowledge base; per-type room counts live in `inventory.json`; availability is derived. The LLM *presents* availability; it never computes it.

**Why:** Keeps a single place to edit rates, adds a data-driven fit check (room vs adults/children), and avoids "hardcoded numbers buried in code."

## 6. Single LLM route (Kilo free gateway by default) via an OpenAI-compatible client

**Decision:** `src/ai/llm.js` calls `POST {PRIMARY_BASE_URL}/chat/completions` with `PRIMARY_MODEL`. The default `.env` points at the Kilo free gateway (`https://api.kilo.ai/api/gateway`, model `kilo-auto/free`) so the assistant runs with **no API key and no cost**; setting `PRIMARY_API_KEY` switches to any paid OpenAI-compatible provider (e.g. Mistral).

**Why:** One configured provider keeps secrets, cost and latency predictable, and the OpenAI-compatible shape makes swapping providers trivial later.

## 7. Graceful degradation — the assistant never goes dark

**Decision:** If the LLM call fails or times out, `/api/chat` automatically answers from `deterministicReply()` (KB FAQ + best-fit room + availability summary) and marks `fallback:true`.

**Why:** Guests shouldn't lose the assistant just because an upstream provider hiccups.

## 8. History is capped and shaped

**Decision:** Only the last 8 user/assistant turns are sent, sequence sanitized, on every chat call.

**Why:** Keeps context relevant and token usage bounded while supporting follow-ups like "what about breakfast?" after a pool question.

## 9. Voice: ElevenLabs multilingual + Vapi assistant created by script

**Decision:** TTS uses `eleven_multilingual_v2` with the default English voice (supports en/hi/kn). A `scripts/create-vapi-assistant.js` script provisions the "Hotel Concierge" phone assistant via Vapi's REST API using the private key.

**Why:** The user explicitly wanted ElevenLabs with EN/Kannada/Hindi (no Telugu) and Vapi for calls. Automating assistant creation means the repo is self-serve: run one script, paste the id, and voice calls work.

## 10. Keys live only in `.env` / `web/.env.local` (never committed)

**Decision:** `.env` is git-ignored; `.env.example` documents the shape. The browser only ever receives the *public* Vapi key via `/api/voice/config`; the private key never leaves the server.

**Why:** Standard secret hygiene — server-only secrets must not reach the client bundle.

## 11. Full-stack portability (Next.js UI + Express API behind rewrites)

**Decision:** The old vanilla/Vite frontend was rebuilt as a Next.js 14 App-Router app (`web/`) that proxies `/api/*` to Express on `:3000`, `npm run dev` runs both.

**Why:** Next.js was explicitly requested for the frontend ("same UI as before but in Next.js"). Rewrites keep the browser calling a single origin, so no CORS leaks and no stray hardcoded keys.

## 12. Tests over mocks (Vitest + Supertest, LLM/TTS injected)

**Decision:** `createApp({ llm, tts })` accepts mock clients; 31 tests cover chat grounding, intent, availability maths, validation, SSE, voice proxy, and KB integrity — all offline.

**Why:** Deterministic, offline, fast tests that evaluate *the product behaviour* (see `docs/EVALUATION.md`), not just unit functions.