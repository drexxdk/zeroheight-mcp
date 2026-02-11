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

### Never run npm run dev

- **Priority**: High
- **Action**: Assume the development server is already running. Do not attempt to start it with `npm run dev`.
- **Rationale**: The development server should be managed by the user.
- **If failures occur**: If operations fail due to the server not being started, inform the user to start it manually and retry when ready.

### Never run the scraper after it has been run

- **Priority**: Critical
- **Action**: NEVER attempt to run the Zeroheight scraper again after it has already been executed successfully in the current session.
- **Check first**: Always check if data has already been scraped before attempting to run the scraper.
- **Rationale**: The scraper performs destructive operations (clears existing data) and takes significant time. Running it multiple times wastes resources and can cause confusion.
- **Instead**: If the user asks to "run the scraper", check the current state and inform them that data is already available, or ask what specific operation they want to perform.
- **Verification**: Look for previous successful scraper execution in the conversation history before proceeding.

### Stop after completing MCP actions

- **Priority**: High
- **Action**: After completing any MCP action (scraper execution, API calls, etc.), stop and wait for user prompt before taking further actions.
- **Rationale**: Prevents automatic chaining of operations that may not be desired and gives users control over the workflow.
- **Instead**: Complete the requested action, report the results, and wait for explicit user instruction for next steps.
- **Examples**: After running scraper, don't automatically query data; after fixing code, don't automatically run tests.

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
