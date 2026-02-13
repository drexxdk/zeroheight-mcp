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

### Never run the scraper after it has been run

- **Priority**: Low (changed from High)
- **Action**: The scraper can be run multiple times safely as it uses upsert logic to handle duplicates. It will update existing data and images without creating duplicates.
- **Rationale**: The scraper now performs safe upsert operations that add new data and update existing data without clearing content. The database handles duplicates automatically.
- **When to run**: Run the scraper whenever requested - it will safely update existing pages and add new ones.
- **No verification needed**: Do not check current data state before running - just execute when asked.

### Stop after completing MCP actions

- **Priority**: High
- **Action**: After completing any MCP action (scraper execution, API calls, etc.), stop and wait for user prompt before taking further actions.
- **Rationale**: Prevents automatic chaining of operations that may not be desired and gives users control over the workflow.
- **Instead**: Complete the requested action, report the results, and wait for explicit user instruction for next steps.
- **Examples**: After running scraper, don't automatically query data; after fixing code, don't automatically run tests.

### Use mcp-call for MCP tool execution

- **Priority**: High
- **Action**: When the user asks you to run or test an MCP tool, always use the `mcp-call` script instead of making direct API calls or using other methods.
- **Rationale**: The `mcp-call` script provides standardized, reliable MCP API interaction with proper headers, error handling, and response formatting.
- **When to apply**: When user requests involve running, testing, or calling any MCP tools (scrape-zeroheight-project, query-zeroheight-data, list-tables, etc.)
- **How to use**: Run `npm run mcp-call -- "<tool-name>"` or `npx tsx scripts/mcp-call.ts "<tool-name>"` with appropriate arguments
- **Examples**:
  - User asks "run List Tables" → use `npm run mcp-call -- "list-tables"`
  - User asks "test the scraper" → use `npm run mcp-call -- "scrape-zeroheight-project"`
  - User asks "query data" → use `npm run mcp-call -- "query-zeroheight-data" '{"search": "button"}'`
  - User asks "get database types" → use `npm run mcp-call -- "get-database-types"`

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
- **How to call**: Use the `mcp-call` script (`npm run mcp-call -- "<tool-name>"`) or `npx tsx scripts/mcp-call.ts "<tool-name>"` and pass validated arguments (for destructive actions, include the required `apiKey` or confirmation token). Prefer PowerShell/CLI-friendly invocation formats (see `scripts/mcp-call.ts` for accepted argument formats).
- **Rationale**: This centralizes access control, logging, and validation on the server side and prevents accidental direct modifications to the database or storage from local scripts.
- **Safety**: For destructive actions (clear, delete), require the explicit `MCP_API_KEY` confirmation parameter and never attempt destructive operations without it.

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

### Interaction Guidelines

- **Don't suggest follow-up commands**: Only suggest or execute follow-up commands when explicitly asked, or when it's necessary to complete the current task
- **Focus on requested actions**: Complete the user's specific request without adding unsolicited suggestions for next steps
