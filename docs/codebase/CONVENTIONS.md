# Conventions

ES modules use kebab-case filenames and explicit `.mjs` imports. API responses contain `ok`; errors contain stable codes and request IDs. Database identifiers are lowercase snake_case and timestamps are `timestamptz`. Secrets never appear in logs or committed config.

Evidence: `apps/api/src/core/errors.mjs`, `apps/api/migrations/001_foundation.sql`, `.env.example`.
