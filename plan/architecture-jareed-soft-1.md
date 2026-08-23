---
goal: Production-ready Jareed Soft platform
version: 1.0
date_created: 2026-08-23
last_updated: 2026-08-23
owner: Jareed Soft
status: 'In progress'
tags: [architecture, email, ai, foundation]
---

# Introduction

![Status: In progress](https://img.shields.io/badge/status-In_progress-yellow)

Build and verify the platform incrementally. A phase cannot be marked complete until its automated gates pass and external providers acknowledge their operations.

## 1. Requirements & Constraints

- **REQ-001**: Application code lives only in `smart-email-marketing`.
- **REQ-002**: Support Gmail API, Microsoft Graph, SMTP, and API providers through adapters.
- **REQ-003**: Support AI research, cited knowledge, campaigns, segmentation, scheduling, replies, bounces, and analytics.
- **SEC-001**: Encrypt provider credentials and enforce tenant isolation and suppression before every send.
- **CON-001**: External integration completion requires real OAuth/provider credentials.
- **GUD-001**: Never report success without backend and upstream evidence.
- **PAT-001**: PostgreSQL is durable state; Redis/BullMQ is asynchronous transport.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Establish verifiable foundation.

| Task | Description | Completed | Date |
|---|---|---|---|
| TASK-001 | Add schema, API/worker split, provider contracts, health UI, and pure tests. | ✅ | 2026-08-23 |
| TASK-002 | Add CI to run tests, migration checks, dependency audit, and container build. |  |  |
| TASK-003 | Add Supabase Auth mapping and RLS policies with tenant-leak tests. |  |  |

### Implementation Phase 2

- GOAL-002: Complete real mailbox and delivery lifecycle.

| Task | Description | Completed | Date |
|---|---|---|---|
| TASK-004 | Implement OAuth PKCE callbacks, token refresh, encrypted credential resolver, and revocation. |  |  |
| TASK-005 | Implement transactional outbox, scheduler, worker dispatch, provider failover policy, and idempotency. |  |  |
| TASK-006 | Verify one sandbox send per provider and persist acknowledgement, bounce, reply, and complaint events. |  |  |

### Implementation Phase 3

- GOAL-003: Deliver campaign, compliance, analytics, and knowledge workflows.

| Task | Description | Completed | Date |
|---|---|---|---|
| TASK-007 | Build contact import, consent records, segmentation, campaign editor, and RFC 8058 unsubscribe. |  |  |
| TASK-008 | Build official-source crawler, evidence store, research runs, cited answers, and prompt-injection quarantine. |  |  |
| TASK-009 | Build event-derived analytics, reply classification, provider health, alerts, audit log, and operator UI. |  |  |

### Implementation Phase 4

- GOAL-004: Prove production readiness.

| Task | Description | Completed | Date |
|---|---|---|---|
| TASK-010 | Run unit, integration, E2E, load, security, tenant-isolation, suppression, and provider-failure tests. |  |  |
| TASK-011 | Complete backup/restore drill, secret rotation, incident runbooks, dashboards, and SLOs. |  |  |
| TASK-012 | Deploy staging, complete controlled pilot, then approve production. |  |  |

## 3. Alternatives

- **ALT-001**: Microservices now; rejected because it adds operational cost before boundaries are proven.
- **ALT-002**: Direct sends inside HTTP requests; rejected because it cannot provide durable retries or backpressure.

## 4. Dependencies

- **DEP-001**: PostgreSQL/Supabase project and Redis service.
- **DEP-002**: Google Cloud OAuth, Microsoft Entra application, and at least one SMTP/API provider sandbox.

## 5. Files

- **FILE-001**: `apps/api` contains the API, worker, adapters, migration, and tests.
- **FILE-002**: `apps/web` contains the operator UI.

## 6. Testing

- **TEST-001**: `npm test` must pass without credentials.
- **TEST-002**: Provider sandbox tests must persist real upstream IDs and webhook events.
- **TEST-003**: Tenant isolation and suppression tests must prove prohibited sends are impossible.

## 7. Risks & Assumptions

- **RISK-001**: Sender reputation can be damaged by uncontrolled volume; limits, warm-up, and suppression are hard gates.
- **ASSUMPTION-001**: The user will supply or connect production provider accounts only after foundation review.

## 8. Related Specifications / Further Reading

See `docs/ARCHITECTURE.md` and `docs/codebase/CONCERNS.md`.
