# SEP-1686 — Background Tasks in zeroheight-mcp
Short, focused notes on how SEP-1686 is applied here.
## What SEP-1686 is (brief)
- A concise job shape: create a job, track status, append logs, return structured results, support polling/tailing.
## Why SEP-1686
- Immediate job id for async work.
- Structured logs/results for easier debugging and automation.
- Reusable tools and consistent lifecycle.
## How this project uses SEP-1686
- Database & types: `tasks` table with `id, name, status, started_at, finished_at, logs, result`; generated TS types in `src/generated/`.
### Job lifecycle (short)
- Create: `createJob({ name, args })` → immediate `jobId`.
- Process: workers atomically claim, append logs, then `finishJob({ jobId, success, result })` or schedule retry.
- Retry/idempotency: attempt metadata + optional `idempotency_key` prevent duplicate side-effects.
### Tooling & RPC surface
- Tools: `createJob`, `getJob`, `tailJob`, `getResult` (+ admin variants).
- Validation: `zod` schemas at the RPC boundary.
- Options: `requestedTtlMs`, `pollInterval`, `tailFrom` for polling and tailing.
### Worker model (how it works)
- Claim: atomic claims (e.g. `UPDATE ... RETURNING` or `SELECT ... FOR UPDATE SKIP LOCKED`).
- Work: set `started_at`, append logs, perform task.
- Finish/retry: set `status`, write compact `result`, or increment attempts and set `next_attempt_at` with backoff.
### Operational notes
- Index jobs on `status` + `next_attempt_at`.
- Append logs incrementally and keep `result` compact.
# SEP-1686 — Background Tasks in zeroheight-mcp

## What SEP-1686 is (brief)

- SEP-1686 defines a lightweight, consistent shape and tooling for background task/job management (create a job, track status, append logs, return results, allow polling/tailing).
- Benefits: predictable lifecycle, standard endpoints/tools for clients to check progress, and a schema that supports structured results and logs.

## Why SEP-1686 is great (high level)

- Decouples request lifecycle from long-running work: clients get an immediate job id and can poll/tail without blocking HTTP requests.
- Structured results and logs let callers diagnose failures and consume outputs programmatically.
- Having a standard shape enables tool wrappers and infrastructure (auth, validation, error normalization) to be reused across many tools.

## How this project uses SEP-1686

Database & types: the project stores tasks in a `tasks` table whose key columns include `id`, `name`, `status`, `started_at`, `finished_at`, `logs` (text/JSON), and a `result` JSONB column for structured outputs. The repo also provides generated TS types (`src/generated/database-schema.ts`, `src/generated/database-types.ts`) so code and tools can reference a single canonical shape for `result` and `logs`.

### Job lifecycle (simple)

Create: a client calls a simple RPC (e.g. `createJobInDb({ name, args })`) and receives a stable `jobId` immediately. The job row is stored with an initial status such as `queued` or `working` and basic metadata (`created_at`, `name`, `args`).

Claim & process: background workers claim jobs atomically (so only one worker owns a job at a time), process the work, append logs as they progress, and then mark the job `completed` or `failed` with a structured `result` or `error` payload.

Retry & idempotency: the job row includes retry metadata (attempt count, `next_attempt_at`) and can include an `idempotency_key` so workers can safely retry without double-processing side effects.

### Tooling & RPC surface (plain-language)

Tools exposed: the repo exposes a small set of RPCs (MCP tools) around jobs: `createJob`, `getJob`, `tailJob` (follow logs), and `getResult`. There are admin variants for privileged operations.
Validation & normalization: each tool has a `zod` schema so inputs/outputs are validated at the RPC boundary; the route wrapper converts handler returns into a consistent tool response shape so callers get predictable fields (status, value, error).
Common parameters: tools accept a few simple, useful options like `requestedTtlMs` (how long the caller wants to wait), `pollInterval` (for polling loops), and `tailFrom` (a log offset or timestamp to follow new logs). These let clients choose short-poll, long-poll, or streaming tail behaviour without changing the tool.

### Worker model & implementation notes (how it actually works)

Claiming a job: workers use an atomic claim pattern so two workers don't process the same job. Typical approaches are `UPDATE ... WHERE status='queued' AND next_attempt_at <= now() RETURNING *` or `SELECT ... FOR UPDATE SKIP LOCKED` to safely reserve a row.
Processing loop: after claiming, the worker updates `started_at`, writes progress via `appendJobLog(jobId, message)`, and performs the work. Progress logs are appended incrementally (not replacing the whole log blob) to reduce write amplification.
Finishing: on success the worker calls `finishJob({ jobId, success: true, result })` which sets `finished_at` and `status=completed` and writes a compact `result` (summary + references). On failure the worker increments the attempt counter, records the error, and sets `next_attempt_at` using an exponential backoff calculation.
Idempotency & side-effects: to avoid duplicate side-effects, workers either design tasks to be idempotent (check existence before write) or use an `idempotency_key` stored on the job that the worker checks when performing external ops.

### Operational & observability notes (short)

Jobs are indexed for quick pickup (status + next attempt). Logs are append-only and trimmed by retention policy. `result` is intentionally compact (summary + artifact refs) so queries and updates stay fast.

## Validation, normalization and tool safety

- Zod schemas: all MCP tool inputs and outputs are validated with `zod` (e.g. task tool schemas under `src/tools/tasks`). This ensures well-formed RPCs and predictable runtime behavior.
- Tool wrapper normalization: the MCP route registers tools using a wrapper that normalizes arbitrary handler returns into a consistent `ToolResponse` shape. That centralizes error handling and prevents accidental shape mismatches.
- Input coercions: input schemas accept common cross-type values (e.g., numeric strings coerced to numbers) to make the RPC surface forgiving for CLI and HTTP callers.

## Performance features used in this app (concrete)

- Scraper concurrency tuning: the scraper exposes `scraper.concurrency` and `scraper.imageConcurrency` (see `src/utils/config.ts`) to control parallel page and image processing.
- Prefetch & navigation tuning: `scraper.prefetch` options, `viewport` nav timeouts, and `navWaitUntil` (defaults to `networkidle2`) balance scrape speed vs. correctness for dynamic pages.
- DB batching and backoff: uploads and upserts are batched (`pageUpsertChunk`, `imageInsertChunk`) and include backoff (`bulkUpsertBackoffMs`) to avoid overwhelming the DB.
- Retries and exponential backoff: scraper and image upload helpers use configurable retry policies (`scraper.retry` and `image.upload` settings) to be resilient to transient failures.
- Limits and safeguards: multiple caps are defined in config — `db.queryLimit`, `storage.listLimit`, `fileSizeLimitBytes`, and `contentMaxChars` — to keep operations bounded and predictable.
- Rate limiting at server level: `server.rateLimitTokens` provides a global token budget for MCP calls, helping prevent DOS from accidental high request rates.
- Scraper concurrency tuning: the scraper exposes `scraper.concurrency` and `scraper.imageConcurrency` (see `src/utils/config.ts`) to control parallel page and image processing. These knobs are used to match CPU/memory/network capacity and avoid headless browser thrash.
- Navigation & resource optimization: `scraper.prefetch`, resource blocking, and `navWaitUntil` settings reduce unnecessary network work. The scraper can reuse browser contexts and pages to amortize startup costs across multiple navigations.
- Chunked DB operations & streaming uploads: page and image writes are batched (`pageUpsertChunk`, `imageInsertChunk`) and streamed where possible; image uploads use multipart/streamed techniques to avoid loading full binaries into memory.
- Backoff, retries & circuit-breaking: helpers implement exponential backoff with jitter and a small circuit-breaker layer to avoid retry storms. Configurable retry counts and per-operation timeouts prevent stuck workers.
- Connection pooling & resource limits: DB and storage clients use connection pooling and keep-alive settings to avoid connection churn; `scraper.concurrency` + `imageConcurrency` together limit aggregate resource usage.
- Efficient logging & results: logs are appended incrementally and trimmed per retention policy; `result` payloads are kept small (summary + artifact refs) to reduce write amplification on JSONB columns.
- Observability-driven tuning: real runs are measured (latency, CPU, DB query rate) and tuning knobs are adjusted accordingly; `scraper.debug` and runtime metrics make this iterative tuning straightforward.

## Observability & diagnostics

- Structured logs: task errors and tool-level failures are logged with structured context (see `src/utils/logger.ts` and jobStore log/error calls).
- Task logs: `appendJobLog` stores textual logs per task for later inspection via admin endpoints or CLI `tail-job-admin`.
- Runtime debug toggles: `scraper.debug` and other config flags make it easy to increase verbosity during development without changing code paths.
