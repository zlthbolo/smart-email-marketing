# Jareed Soft Architecture

## Decision

Use a modular monolith with independent API and worker processes. PostgreSQL is the source of truth; Redis/BullMQ is transport, never durable business state. Provider-specific behavior is isolated behind adapters. This keeps the first production release understandable while preserving clean seams for later extraction.

## Runtime flow

1. API validates tenant, consent, campaign, schedule, and mailbox eligibility.
2. A PostgreSQL transaction materializes immutable `campaign_recipients`; queue failure moves the campaign to `failed` and restores unsent recipients to `pending` for explicit recovery.
3. Scheduler adds idempotent BullMQ jobs with deterministic bounded jitter.
4. Worker re-checks suppression, mailbox status, ramp limit, and campaign state immediately before sending.
5. Provider adapter returns `accepted` only with an upstream acknowledgement/message ID.
6. Normalized webhooks are signature-verified, persisted idempotently in `provider_events`, then update delivery, reply, bounce, complaint, and suppression state.
7. Analytics derives from immutable events; opens are advisory because privacy proxies make them unreliable.

## Trust boundaries

- OAuth tokens and SMTP/API credentials are AES-256-GCM envelopes; plaintext exists only during provider calls.
- Tenant ID is derived from authenticated identity, never accepted from request bodies.
- Every API query derives tenant ID from the authenticated server session. For Supabase deployment, keep the service role server-only and add RLS policies mapped to the chosen Supabase Auth claims before exposing direct database access.
- Inbound email and crawled documents are untrusted data, never agent instructions. High-risk agent actions require approval.
- Marketing sends require consent basis, suppression check, physical address, and one-click unsubscribe.

## Provider contract

`verify()` must make a harmless authenticated upstream call. `send()` returns either an acknowledged provider message ID or a structured rejection with retryability. Auth/validation errors never fail over; 429, 5xx, and network failures may fail over to a separately warmed provider.

## Knowledge and research

Deep research runs through the OpenAI Responses API in background mode with web search. Returned URL citations are stored in `knowledge_sources`; the UI shows the report and evidence count. Web content is explicitly treated as untrusted data, not agent instructions. The campaign agent uses strict structured output and produces drafts only; the operator schedules them explicitly.

## Evidence

- `apps/api/migrations/001_foundation.sql`
- `apps/api/src/providers/`
- `apps/api/src/worker.mjs`
- `apps/api/src/routes/health.mjs`
