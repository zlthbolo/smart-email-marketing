# Jareed Soft

Jareed Soft is a multi-tenant email operations platform for compliant campaigns, mailbox management, university knowledge bases, and AI-assisted research.

## Repository roles

- `zlthbolo/smart-email-marketing`: application source of truth.
- `zlthbolo/email-saas-agent-skills`: read-only implementation reference. Application code must never be added there.

## What is implemented

- Arabic RTL web app with registration, sessions, tenant isolation, health dashboard, mailbox management, contacts, campaigns, analytics, research, and a local test outbox.
- Gmail OAuth, Microsoft OAuth/Graph, SMTP, Resend, Postmark, and an explicitly non-delivering test sink.
- PostgreSQL migrations, encrypted provider credentials, Redis/BullMQ workers, retries, deterministic bounded jitter, atomic daily limits, and gradual sender ramp-up.
- Consent evidence, suppression checks immediately before send, one-click unsubscribe, open events, and signed normalized delivery/reply/bounce/complaint webhooks.
- OpenAI Responses API campaign drafting and background deep research with web search and citation storage.

A provider is never reported as healthy without a verification call. A real message is never marked accepted unless the upstream provider returns a message ID. The test sink is always labelled as local and never claims internet delivery.

## Run locally

1. Run `docker compose up --build`.
2. Open `http://localhost:3000`; API health is at `http://localhost:3001/v1/health`.

The default Compose values are development-only and make the local test sink work immediately. Before using a real provider, copy `.env.example` to `.env`, generate a unique 32-byte base64 encryption key, change the webhook secret and database password, then add only the OAuth/OpenAI settings you need. Compose reads those values automatically.

No real email is sent until a provider is configured and verified. OAuth tokens, SMTP passwords, and API keys are stored only as AES-256-GCM credential envelopes.

## Provider events

Provider-specific webhook receivers should normalize events and POST the JSON body to `/v1/webhooks/events` with `x-jareed-signature: sha256=<hex-hmac>`. Sign the exact raw JSON body with `WEBHOOK_SIGNING_SECRET`. Required fields are `providerEventId`, `providerMessageId`, `provider`, and `eventType`. Supported event types are `delivered`, `opened`, `clicked`, `replied`, `bounced`, and `complained`; duplicate event IDs are idempotent. Hard bounces and complaints add a suppression automatically.

## Quality gates

```bash
npm test
docker compose config
```

The test suite is provider-safe: it mocks upstream HTTP acknowledgements and never sends internet email. A full local end-to-end run requires Docker because PostgreSQL and Redis are real dependencies.

See `docs/ARCHITECTURE.md`, `docs/codebase/CONCERNS.md`, and `plan/architecture-jareed-soft-1.md`.
