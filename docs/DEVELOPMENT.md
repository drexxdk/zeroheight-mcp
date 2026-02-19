# Development & Contribution Guide

This document shows the common developer workflow, important safety notes for MCP tools, and commands to validate changes.

Prereqs

- Node.js 18+ and npm
- Optional: Supabase project for local development

Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment file and populate secrets:

```bash
cp .env.example .env.local
```

3. Populate `ZEROHEIGHT_MCP_ACCESS_TOKEN` and Supabase keys in `.env.local` (do not commit).

Important safety notes

- Never commit `ZEROHEIGHT_MCP_ACCESS_TOKEN` or service role keys. Add `.env.local` to `.gitignore`.
- Do not run destructive MCP tools (eg. `clear-database`) without explicit confirmation.
- Scraper scripts under `scripts/` should not be executed remotely by the assistant; prefer calling MCP tools via the server API.

Common commands

- Build: `npm run build`
- Lint: `npm run lint`
- Run a focused Node script (examples exist in `scripts/`):

```bash
# regenerate DB runtime types
npx tsx scripts/generate-database-types.ts
```

Calling MCP tools (recommended)

Use the included helper scripts or call the MCP server API. The repository exposes `scripts/run-tools-list.ts` and other helpers — prefer these over raw `curl` calls.

Example: list tools with the helper script

```bash
npx tsx scripts/run-tools-list.ts
```

Example: call a tool using Node (preferred over curl):

```bash
node -e "const k=process.env.ZEROHEIGHT_MCP_ACCESS_TOKEN; (async()=>{try{const res=await fetch('http://localhost:3000/api/mcp',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream','Authorization':'Bearer '+k},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});console.log(await res.text());}catch(e){console.error(e);} })()"
```

Validation (required before commit / PR)

- Run `npm run build` and fix any TypeScript errors.
- Run `npm run lint` and fix lint issues. The project enforces strict TypeScript rules; avoid `any` types.

Regenerating DB types

After running migrations or changing the database, regenerate the TypeScript DB schema and runtime types:

```bash
npx -y supabase@2.72.8 gen types typescript --project-id <project-id> --schema public > src/database.schema.ts
npx tsx scripts/generate-database-types.ts
```

CI recommendations

- Run `npm run build`, `npm run lint`, and tests on PRs.
- Require successful CI for merges to `main`.

Contributing

- Open a PR with a clear description and include `npm run build` and `npm run lint` output if you changed TypeScript types or configs.
