# GitHub Copilot Instructions

## Code Quality Rules

### Never use "any" type

- **Priority**: High
- **Action**: Never use the `any` type in TypeScript code. Always use specific types, interfaces, or union types instead.
- **Rationale**: The `any` type defeats the purpose of TypeScript's type safety and can lead to runtime errors that could have been caught at compile time.
- **Common alternatives**:
  - Define proper interfaces for objects
  - Use union types (`string | number`) for variables that can have multiple types
  - Use generic types when the type is parameterized
  - Use `unknown` for truly unknown values that need type checking before use
  - Leverage TypeScript's built-in utility types (`Record<string, unknown>`, `Partial<T>`, etc.)

- **Note to Copilot (agent-specific)**: You are the repository assistant. When editing or generating TypeScript code in this project, never emit the `any` type. Prefer concrete types, generated DB types (`src/database-schema.ts` / `src/database-types.ts`), `unknown` with runtime checks, or explicit unions. If you cannot determine an appropriate type, ask the user instead of using `any`.

### Never use double-cast bypasses (`as unknown as Type`)

- **Priority**: High
- **Action**: Do not use double-casts like `as unknown as SomeType` to bypass TypeScript's type system. Avoid forcing types by casting through `unknown` or other intermediate casts.
- **Rationale**: Double-casts silently defeat the compiler's guarantees and make code brittle and unsafe. They hide type mismatches that should be addressed with proper typing, runtime checks, or small, well-typed test fixtures.
- **Preferred alternatives**:
  - Create a minimal, explicit typed fixture or helper function that constructs a value matching the required type (for tests, use narrow mock types or `Partial<T>` with explicit fields).
  - Use `unknown` only at boundaries where you perform runtime validation before asserting a concrete type.
  - Define small interfaces or use `as const` where appropriate instead of coercing large objects.
  - When testing request-like objects, prefer creating a lightweight typed mock implementing the required interface (for example, a small `NextRequest`-shaped object) rather than double-casting.

**Examples**:

- Bad: `const req = someObject as unknown as NextRequest;`
- Good: `const req: Partial<NextRequest> = { headers: { get: () => "x" } }; authenticateRequest({ request: req as NextRequest });`

### Always fix ESLint errors

- **Priority**: High
- **Action**: Before committing or submitting code, run `npx eslint .` and fix all reported errors
- **Rationale**: Maintains code quality and prevents linting issues in CI/CD pipelines
- **Common fixes**:
  - Replace `any` types with specific TypeScript types
  - Use `const` instead of `let` for variables that are never reassigned
  - Remove unused imports and variables
  - Follow consistent naming conventions

### Always create TypeScript files instead of JavaScript

- **Priority**: High
- **Action**: When creating new script files, always use `.ts` extension and TypeScript syntax instead of `.js` and JavaScript
- **Rationale**: TypeScript provides compile-time type checking, better IDE support, and helps catch errors early in development
- **When to apply**: Creating new utility scripts, CLI tools, configuration files, or any code that would benefit from type safety
- **Examples**:
  - Use `script.ts` instead of `script.js`
  - Add proper type annotations to function parameters and return types
  - Use interfaces for object structures
  - Leverage TypeScript's advanced features like union types and generics

### Always validate code changes with build and lint

- **Priority**: Critical
- **Action**: After making any code changes, always run both `npm run build` and `npm run lint` to validate the changes. Only consider the task complete when both commands succeed without errors.
- **Rationale**: Ensures code quality, prevents build failures, and catches linting issues before they reach production or CI/CD pipelines.
- **When to apply**: After any code modification, refactoring, or new feature implementation.
- **Completion criteria**: Both build and lint must pass successfully before declaring the task done.
- **Reporting**: Show the successful outcomes of both commands when the task is complete.
- **If failures occur**: Fix all build and lint errors before considering the task complete. Do not proceed until both validations pass.

### Never run npm run dev

- **Priority**: High
- **Action**: Assume the development server is already running. Do not attempt to start it with `npm run dev`.
- **Rationale**: The development server should be managed by the user.
- **If failures occur**: If operations fail due to the server not being started, inform the user to start it manually and retry when ready.

### Never run scraper scripts from chat (MCP-only)

- **Priority**: Highest
- **Action**: Under no circumstance should the assistant start or execute any local scraper script or call `scrape` directly from the project while interacting in chat. Always invoke scraping via the MCP-exposed tool (`scrape`) through the MCP server API. Do not run `npx tsx scripts/test-scrape-specific-pages.ts`, `scripts/worker.ts`, or any other script that executes the scraper from the repository unless the user explicitly and unambiguously instructs you to "run locally" and grants permission.
- **Rationale**: This prevents inadvertent long-running browser/scraping processes started by the assistant, centralizes control via the MCP API endpoint, and preserves auditability and permissions for destructive or heavy operations.
- **When to run**: Use the MCP `scrape-zeroheight-project` tool by calling the server API (`tools/call`) with the appropriate `ZEROHEIGHT_MCP_ACCESS_TOKEN`. Only run local scraper scripts when the user explicitly requests a local run.
- **Enforcement**: The assistant must refuse to run or start any scraper script from the repository in chat and should instead inform the user how to run it locally or call the MCP tool on their behalf.

### Stop after completing MCP actions

- **Priority**: High
- **Action**: After completing any MCP action (scraper execution, API calls, etc.), stop and wait for user prompt before taking further actions.
- **Rationale**: Prevents automatic chaining of operations that may not be desired and gives users control over the workflow.
- **Instead**: Complete the requested action, report the results, and wait for explicit user instruction for next steps.
- **Examples**: After running scraper, don't automatically query data; after fixing code, don't automatically run tests.

### Invoke MCP tools via the server API

- **Priority**: High
- **Action**: When the user asks you to run or test an MCP tool, call the MCP tool via the server API endpoint. Include the `Authorization: Bearer <ZEROHEIGHT_MCP_ACCESS_TOKEN>` header and `Accept: application/json, text/event-stream` when making requests.
- **Rationale**: Direct API calls are explicit and portable across environments; many editors also provide MCP integrations that can be configured to call the same endpoint.
- **When to apply**: When user requests involve running, testing, or calling any MCP tools (scrape-zeroheight-project, query-zeroheight-data, list-tables, etc.)
  **Examples**: Use the `tools/list` RPC to discover tool names and call `tools/call` with the tool name and arguments.

- **Testing the scraper locally**: When you want to run a focused scraper test against specific pages, use the provided script `scripts/test-scrape-specific-pages.ts`. Run it with:

  ```bash
  npx tsx scripts/test-scrape-specific-pages.ts
  ```

  This runs `scrapeZeroheightProject` with a curated list of test URLs and is the recommended local test harness for the scraper.

### Prefer MCP tools defined in the app API

- **Priority**: High
- **Action**: When asked to perform actions that interact with the MCP (clear data, run scrapers, query stored data, or other project-level tasks), use the MCP tools exposed by the project API rather than calling services or endpoints directly.
- **Where the tools are defined**: The available MCP tools and their server-side implementations are declared in `app/api/[transport]/route.ts` — consult this file to discover which tools exist and how they are named.
- **Discovery-first approach**: Use the `tools/list` tool (the MCP tool that lists available tools) as the starting point to discover tool names and accepted arguments before invoking a tool.
- **How to call**: Call the MCP server API directly (e.g., `tools/list` and `tools/call`) or use your editor's MCP integration. Ensure requests include `Authorization: Bearer <ZEROHEIGHT_MCP_ACCESS_TOKEN>` and `Accept: application/json, text/event-stream`.
- **Rationale**: This centralizes access control, logging, and validation on the server side and prevents accidental direct modifications to the database or storage from local scripts.
- **Safety**: For destructive actions (clear, delete), require the explicit `ZEROHEIGHT_MCP_ACCESS_TOKEN` confirmation parameter and never attempt destructive operations without it.

### Network request policy (Node-only)

- **Priority**: Medium
- **Action**: Do not use `curl`, `Invoke-WebRequest`, or other shell-native HTTP clients for interacting with the MCP endpoint or other project HTTP APIs. Always use Node-based HTTP callers (for example, `fetch` in `tsx` scripts or `node-fetch`) when writing scripts or invoking the MCP API programmatically.
- **Rationale**: Node-based requests avoid platform-specific header parsing issues (PowerShell/CMD differences), ensure consistent handling of JSON and streaming responses, and integrate better with the project's TypeScript toolchain and environment variables.
- **When to apply**: Use Node scripts for all automated requests in `scripts/` and CI; prefer `npx tsx` helpers for local developer tooling that calls MCP endpoints.
- **Examples**:

  ```bash
  # Good: use Node/tsx script
  npx tsx scripts/clear-zeroheight-mcp.ts "$ZEROHEIGHT_MCP_ACCESS_TOKEN"
  ```

  ````bash
  ```instructions
  # Repository assistant instructions (condensed)

  These guidelines are intended to be short, authoritative, and easy for any assistant or contributor to follow.

  ## Core rules

  - **Follow ESLint**: Always obey the rules in `eslint.config.mjs`. Before producing edits, read `eslint.config.mjs` and make a best-effort to generate code that passes `npm run lint` and `npm run build`.
  - **TypeScript safety**: Never emit `any` or use `as unknown as Type` casts. Prefer concrete types, generated DB types (`src/database-schema.ts` / `src/database-types.ts`), or `unknown` with runtime checks.
  - **Validate changes**: After edits, run `npx eslint .` and `npm run build` (or `npx -y tsc --noEmit`). Apply `npx eslint --fix` where safe; if lint/build failures remain, stop and ask the user prior to committing.

  ## Scraper & MCP guidance

  - **Don't run local scrapers from chat**: Never start local scraper scripts from a chat session. Use the MCP tools exposed by the app API (see `app/api/[transport]/route.ts`) and call them via the server API with the appropriate token.
  - **Stop after MCP actions**: After performing any MCP action, report results and wait for the user's next instruction; do not chain additional operations automatically.

  ## Tooling & repository hygiene

  - **No hidden repo changes**: Do not add/modify/remove repo-level scripts or CI helpers without explicit user permission.
  - **Use generated DB types**: Regenerate and use `src/database-schema.ts` / `src/database-types.ts` after DB migrations.

  ## Assistant pre-edit checklist (required)

  Before editing or generating code, the assistant MUST:

  - Read `eslint.config.mjs` at the repo root and honor its rules when producing code.
  - Preface any file-editing tool call with a concise (1–2 sentence) preamble naming the file(s) to change and the lint rules being focused on.
  - Attempt to run `npm run lint` and `npm run build` after edits; apply `npx eslint --fix` where safe. If issues remain, stop and ask the user for guidance instead of committing.
  - Use the repository's todo tracking (assistant's TODO tool) for multi-step code changes.

  ## Short rationale

  This file exists to keep automated and human contributors aligned on the project's quality rules. Prefer small, well-typed changes and avoid temporary workarounds that bypass lint or type checks.

  ````

  - Attempt to run `npm run lint` and `npm run build` after edits; apply `npx eslint --fix` where safe, and if errors remain, stop and ask the user for guidance rather than committing or merging.
