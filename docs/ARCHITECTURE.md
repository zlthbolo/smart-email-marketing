# Jareed Soft Architecture

## Decision

Use a modular monolith with independent API and worker processes. PostgreSQL is the source of truth; Redis/BullMQ is transport, never durable business state. Provider-specific behavior is isolated behind adapters. This keeps the first production release understandable while preserving clean seams for later extraction.

## Runtime flow

1. API validates tenant, consent, campaign, schedule, and mailbox eligibility.
2. PostgreSQL transaction materializes `campaign_recipients` and an outbox event (outbox is Phase 2).
3. Scheduler adds idempotent BullMQ jobs with deterministic bounded jitter.
4. Worker re-checks suppression, mailbox status, ramp limit, and campaign state immediately before sending.
5. Provider adapter returns `accepted` only with an upstream acknowledgement/message ID.
6. Webhooks are signature-verified, persisted idempotently in `provider_events`, then processed asynchronously.
7. Analytics derives from immutable events; opens are advisory because privacy proxies make them unreliable.

## Trust boundaries

- OAuth tokens and SMTP/API credentials are AES-256-GCM envelopes; plaintext exists only during provider calls.
- Tenant ID is derived from authenticated identity, never accepted from request bodies.
- PostgreSQL RLS will be enabled when Supabase Auth identity mapping is added; the service role must remain server-only.
- Inbound email and crawled documents are untrusted data, never agent instructions. High-risk agent actions require approval.
- Marketing sends require consent basis, suppression check, physical address, and one-click unsubscribe.

## Provider contract

`verify()` must make a harmless authenticated upstream call. `send()` returns either an acknowledged provider message ID or a structured rejection with retryability. Auth/validation errors never fail over; 429, 5xx, and network failures may fail over to a separately warmed provider.

## Knowledge and research

The research pipeline is source-first: crawl allowed official pages/PDFs, hash and version sources, extract claims with citations, and publish only claims backed by stored evidence. An AI-generated answer without evidence remains `draft` and cannot update the canonical knowledge base.

## Evidence

- `apps/api/migrations/001_foundation.sql`
- `apps/api/src/providers/`
- `apps/api/src/worker.mjs`
- `apps/api/src/routes/health.mjs`
