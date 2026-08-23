# Structure

`apps/api` contains HTTP and worker runtimes, provider adapters, pure domain controls, SQL migrations, and tests. `apps/web` is the initial operator UI. `docs` records verified architecture; `plan` is the execution backlog. The pre-existing `backend/` is legacy and should be removed only after parity is proven.

Evidence: repository tree, `apps/api/src/server.mjs`, `apps/api/src/worker.mjs`.
