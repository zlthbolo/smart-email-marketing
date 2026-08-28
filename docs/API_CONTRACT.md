# Jareed Soft API contract

All application routes use `/api/v1`, JSON, and the single-admin HTTP-only session cookie. There is no registration, tenant, workspace, team, client, billing, pricing, plan, role, or seat API.

## Envelope

Success:

```json
{ "ok": true, "data": {}, "meta": { "page": 1, "pageSize": 25, "total": 0 } }
```

Failure:

```json
{ "ok": false, "error": { "code": "STABLE_CODE", "message": "Arabic user-facing message", "details": {} } }
```

Provider operations must return success only after the provider operation itself succeeds. A transport-level HTTP 200 is not proof of an SMTP/IMAP/OAuth/send success.

## Authentication

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/auth/login` | Authenticate the configured owner and issue an HTTP-only session. |
| `POST` | `/auth/logout` | Revoke the current session. |
| `GET` | `/auth/me` | Return the current owner profile. |
| `PUT` | `/auth/password` | Verify current password, replace its hash, and revoke other sessions. |

## Dashboard

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/dashboard?from=&to=&timezone=` | Real counters, daily series, queue counts, worker heartbeat, and sender-health summary. |

Counters: campaigns (total/active/paused), sent, delivered, opened, clicked, replies, positive replies, bounced, failed, unsubscribed, sender accounts (total/healthy/problem), scheduled today, and queue size. `delivered` is counted only when a provider webhook or a delivery-status signal exists.

## Email accounts

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/email-accounts` | Search/filter accounts. Secrets are never returned. |
| `POST` | `/email-accounts` | Add SMTP+IMAP, Gmail app-password, Gmail OAuth, or supported API account. |
| `GET` | `/email-accounts/:id` | Account details, usage, status, health, and recent errors. |
| `PUT` | `/email-accounts/:id` | Update non-secret fields and replace only explicitly supplied secrets. |
| `DELETE` | `/email-accounts/:id` | Delete only when no in-flight messages depend on the account. |
| `POST` | `/email-accounts/:id/test-connection` | Perform real SMTP authentication and, when configured, real IMAP authentication. |
| `POST` | `/email-accounts/:id/send-test` | Send a real message and return provider message ID/accepted recipients. |
| `POST` | `/email-accounts/:id/pause` | Pause selection by the sending engine. |
| `POST` | `/email-accounts/:id/resume` | Resume after validation. |
| `GET` | `/email-accounts/oauth/google/start` | Start owner-authorized Google OAuth when environment credentials exist. |
| `GET` | `/email-accounts/oauth/google/callback` | Store encrypted OAuth material after Google callback. |

Account response fields: `id`, `email`, `provider`, `senderName`, `smtpStatus`, `imapStatus`, `authenticationStatus`, `dailyLimit`, `sentToday`, `remainingToday`, `health`, `lastError`, `lastSuccessfulSendAt`, `state`, `createdAt`, `updatedAt`.

## Campaigns and sequences

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/campaigns` | Search/filter campaigns with real aggregate metrics. |
| `POST` | `/campaigns` | Create a draft campaign. |
| `GET` | `/campaigns/:id` | Campaign, selected senders, sequence, schedule, and metrics. |
| `PUT` | `/campaigns/:id` | Update draft/basic details. |
| `DELETE` | `/campaigns/:id` | Delete only when safe; otherwise require pause and retain audit history. |
| `PUT` | `/campaigns/:id/senders` | Replace the sender pool. |
| `PUT` | `/campaigns/:id/sequence` | Transactionally replace ordered email/delay steps. |
| `PUT` | `/campaigns/:id/schedule` | Save days, time window, timezone, campaign daily cap, and send-now/later start. |
| `POST` | `/campaigns/:id/test` | Render variables and send one real test through a selected account. |
| `POST` | `/campaigns/:id/start` | Validate campaign readiness and materialize idempotent scheduled messages. |
| `POST` | `/campaigns/:id/pause` | Stop new delivery while preserving queued state. |
| `POST` | `/campaigns/:id/resume` | Requeue eligible work without duplicating sent messages. |

Sequence step fields: `id`, `position`, `type` (`EMAIL` or `DELAY`), `subject`, `bodyText`, `bodyHtml`, `delayAmount`, `delayUnit`, `trackOpens`, `trackClicks`.

## Leads

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/leads` | Search/filter/paginate global leads. |
| `POST` | `/leads` | Add one lead with custom fields and tags. |
| `POST` | `/leads/import` | CSV or pasted-list import with explicit dedupe behavior and row-level results. |
| `GET` | `/leads/export` | Export filtered results as CSV. |
| `POST` | `/leads/bulk` | `move_to_campaign`, `pause`, `resume`, `block`, `unsubscribe`, or `delete`. |
| `GET` | `/campaigns/:id/leads` | Campaign membership and engagement status. |
| `POST` | `/campaigns/:id/leads` | Attach existing/new leads with duplicate suppression. |

Lead fields: `email`, `firstName`, `lastName`, `university`, `major`, `company`, `tags`, `customFields`, `status`, `lastContactedAt`, `replyStatus`, `bounceStatus`, and campaign memberships.

## Inbox

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/inbox/threads` | Search/filter/paginate campaign conversations. |
| `GET` | `/inbox/threads/:id` | Ordered inbound/outbound messages for one conversation. |
| `PATCH` | `/inbox/threads/:id` | Set category/read/archive state. |
| `POST` | `/inbox/threads/:id/reply` | Send a real reply from the original account with thread headers. |
| `POST` | `/inbox/sync` | Queue an immediate IMAP sync and return its job ID. |

Categories: `INTERESTED`, `NOT_INTERESTED`, `QUESTION`, `OUT_OF_OFFICE`, `UNSUBSCRIBE`, `OTHER`.

## Analytics, logs, settings, and health

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/analytics/overview` | Date-range campaign totals and daily series. |
| `GET` | `/analytics/campaigns/:id` | Campaign metrics and step funnel. |
| `GET` | `/analytics/senders` | Sender comparison using measured events only. |
| `GET` | `/logs` | Filterable operation/send logs with provider response, message ID, error and retry data. |
| `GET` | `/settings` | Non-secret settings and presence flags for environment secrets. |
| `PUT` | `/settings` | Update sending, retry, tracking and dedupe behavior. |
| `GET` | `/system/status` | Database, Redis/queue, worker heartbeat, last background job, and version. |
| `GET` | `/health/live` | Process liveness only. |
| `GET` | `/health/ready` | Database and Redis readiness. |

## Public event routes

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/t/open/:token.gif` | Record an open only when tracking is enabled; return a pixel regardless. |
| `GET` | `/t/click/:token` | Record click and redirect to the signed destination. |
| `GET/POST` | `/unsubscribe/:token` | Confirm and persist global suppression. |
| `POST` | `/webhooks/resend` | Verify provider signature before accepting delivery/bounce events. |

## Sending-state contract

`QUEUED → SCHEDULED → SENDING → SENT`, with measured follow-on states `DELIVERED`, `BOUNCED`, `REPLIED`, `UNSUBSCRIBED`; terminal errors use `FAILED`. An ambiguous provider outcome uses `UNKNOWN` and is never retried automatically, preventing restart-driven duplicate sends. Every job is keyed by the scheduled-message UUID and every campaign-lead/sequence-step pair is unique.
