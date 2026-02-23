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

  ```bash
  # Avoid: curl in PowerShell, use Node instead
  curl -X POST "http://localhost:3000/api/mcp" \
    -H "Authorization: Bearer $ZEROHEIGHT_MCP_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0",...}'
  ```

### TypeScript Best Practices

- Use specific types instead of `any`
- Define interfaces for complex objects
- Use proper return types for functions
- Leverage TypeScript's type inference when appropriate

### Code Style

- Follow the existing project's ESLint configuration
- Maintain consistent formatting and structure
- Use meaningful variable and function names
- Add comments for complex logic

### Always follow ESLint config file

- **Priority**: High
- **Action**: Always obey the rules defined in `eslint.config.mjs` (root of the repository) when creating or editing files. Before committing, run `npx eslint .` and fix or ask about any reported issues. Do not add temporary `console.log` or other rule-violating code to make tests pass — follow the configuration.
- **Rationale**: Keeps code consistent, avoids CI failures, and ensures automated lint rules are respected.

### Interaction Guidelines

- **Don't suggest follow-up commands**: Only suggest or execute follow-up commands when explicitly asked, or when it's necessary to complete the current task
- **Focus on requested actions**: Complete the user's specific request without adding unsolicited suggestions for next steps

- **Run tools via MCP by default**: When a user asks you to "run", "call", or "invoke" a tool, assume they mean the MCP-exposed tool and call it through the MCP server API unless they explicitly specify that they mean a local script from the `scripts/` folder or say "run locally". Always confirm if there's ambiguity.

### Tooling & Repository Changes

- **Priority**: High
- **Action**: Do not add, modify, or remove repository-level scripts or helper tooling (files under `scripts/`, changes to `package.json` scripts, test-runner helpers, CI helpers, etc.) without explicitly asking the user for permission first.
- **Action**: Do not create temporary diagnostic scripts or helpers committed to the repository unless the user explicitly authorizes this; prefer in-memory diagnostics or asking the user to run commands locally.
- **Action**: If you must add a helper file with the user's permission, place it in a clearly named temporary path (for example `scripts/.tmp/`) and remove it before committing. Document the reason in the commit message and the PR description.
- **Action**: Before committing any change, run the standard checks and fix problems: `npx eslint .` (fix where safe), `npm run build` (or `npx -y tsc --noEmit`) and `npm run test` (or a targeted subset). If any check fails and automatic fix is not safe, ask the user for guidance instead of committing broken code.
- **Rationale**: These rules prevent accidental repository pollution, keep CI/Dev environments stable, and ensure edits follow the project's standards.

### Database Schema & Types

- **Purpose**: Use the auto-generated `src/database-schema.ts` and `src/database-types.ts` as the authoritative source of truth for DB table shapes and runtime Zod schemas. Always regenerate them after migrations and import their types in code instead of hand-writing table shapes or using `any`.
- **When to regenerate**: After applying migrations (for example, running `001_create_tasks_table.sql`), run the schema/type generation scripts immediately.
- **Commands**:
  - Generate the TypeScript DB schema (supabase CLI):

    ```bash
    npx -y supabase@2.72.8 gen types typescript --project-id <project-id> --schema public > src/database-schema.ts
    ```

  - Convert the schema into runtime Zod schemas and inferred types (project helper):

    ```bash
    npm run generate-database-types
    # or
    npx tsx scripts/generate-database-types.ts
    ```

- **Files produced**:
  - `src/database-schema.ts` — static TS types representing DB tables (use this as the generic for Supabase clients)
  - `src/database-types.ts` — runtime Zod schemas and inferred TS types (`TasksType`, `PagesType`, etc.)

- **How to use in code**:
  - Create a typed Supabase client:

    ```ts
    import type { Database } from "src/database-schema";
    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY);
    ```

  - When referencing a table name in `supabase.from(...)`, prefer a `const` literal so the type system recognizes it:

    ```ts
    const table = "tasks" as const;
    await supabase.from(table).select("*");
    ```

  - Import generated runtime/inferred types when you need a concrete shape:

    ```ts
    import type { TasksType } from "src/database-types";
    type JobRecord = TasksType;
    ```

- **Guidelines for changes**:
  - Regenerate the schema & types after any DB migration and commit the generated `src/` files to the repo.
  - Prefer the generated `Database` generic on Supabase clients to avoid `any` casts and manual `as any` workarounds.
  - Avoid using dynamic `string` table names; use `as const` literals to satisfy typed table names.
  - If a new table is added and TypeScript errors appear, regenerate types then run `npm run build` and `npm run lint`.
