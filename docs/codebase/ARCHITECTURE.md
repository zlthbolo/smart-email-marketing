# Architecture

Modular monolith, separate API/worker processes, PostgreSQL source of truth, Redis queue transport, and provider adapters. The UI reads real health probes. No adapter can construct success without an upstream message ID.

Evidence: `docs/ARCHITECTURE.md`, `apps/api/src/providers/provider-result.mjs`.
