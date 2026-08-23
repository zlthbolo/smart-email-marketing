# Testing

Pure-domain tests cover deterministic jitter, warm-up limits, suppression decisions, credential encryption, normalized suppression hashes, provider acknowledgement invariants, and retry classification. Integration tests against PostgreSQL, Redis, and provider sandboxes are `[TODO]` and are gates before production.

Evidence: `apps/api/test/foundation.test.mjs`.
