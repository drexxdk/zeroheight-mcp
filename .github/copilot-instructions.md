# GitHub Copilot Instructions

## Code Quality Rules

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
