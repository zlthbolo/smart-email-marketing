# Jareed Soft

Jareed Soft is a multi-tenant email operations platform for compliant campaigns, mailbox management, university knowledge bases, and AI-assisted research.

## Repository roles

- `zlthbolo/smart-email-marketing`: application source of truth.
- `zlthbolo/email-saas-agent-skills`: read-only implementation reference. Application code must never be added there.

## Foundation status

This branch establishes the production foundation: PostgreSQL schema, Redis/BullMQ queues, provider adapters, real dependency health checks, suppression enforcement, deterministic campaign jitter, API error contracts, and a dependency-status UI. A provider is never reported as healthy or a message as sent without an upstream acknowledgement.

## Run locally

1. Copy `.env.example` to `.env` and replace every required value.
2. Run `docker compose up --build`.
3. Open `http://localhost:3000`; API health is at `http://localhost:3001/v1/health`.

No real email is sent until a provider is configured and verified. OAuth secrets and SMTP passwords must be stored encrypted; the database stores only encrypted credential envelopes.

## Quality gates

```bash
npm test
docker compose config
```

See `docs/ARCHITECTURE.md`, `docs/codebase/CONCERNS.md`, and `plan/architecture-jareed-soft-1.md`.
