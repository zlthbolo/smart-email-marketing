# Concerns

- Legacy backend previously returned original AI content after errors while logging success-like behavior and returned SMTP `false` without a durable failure record.
- Legacy boot used `sequelize.sync({ alter: true })`, unsafe for production migrations.
- Legacy mailbox passwords were plaintext model fields.
- The new worker intentionally stops at `MAILBOX_PROVIDER_RESOLVER_NOT_CONFIGURED`; this prevents false delivery until OAuth/credential resolution is implemented and tested.
- RLS policies, authentication, transactional outbox, webhook verification, reply classification, browser E2E, and monitoring remain required before production.
- `[ASK USER]` Select production hosting and secret manager.
- `[ASK USER]` Select the first real provider account for a sandbox delivery test.

Evidence: legacy `backend/src/services/aiService.ts`, legacy `backend/src/services/smtpService.ts`, legacy `backend/src/config/database.ts`, new `apps/api/src/worker.mjs`.
