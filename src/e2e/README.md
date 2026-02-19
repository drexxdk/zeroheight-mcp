# E2E Tests

This folder contains end-to-end integration scripts for the project.

## Environment

- Copy required vars into `.env.local` (examples: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ZEROHEIGHT_MCP_ACCESS_TOKEN`).

## Running

Run all e2e scripts sequentially:

```
npm run e2e
```

Or run a single script:

```
npx tsx src/e2e/test-full-job-flow.ts
```
