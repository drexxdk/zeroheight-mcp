**Server API and RLS Security Notes**

- Admin/service-role key (`SUPABASE_SERVICE_ROLE_KEY`) is used only server-side.
- New narrow server endpoints under `/api/jobs` perform job lifecycle actions (create, claim, append log, finish, fetch).
- These endpoints require an `x-server-api-key` header that must match `MCP_API_KEY` or `SERVER_API_KEY` in server env.
- Row-Level Security (RLS) is enabled and hardened via migrations in `migrations/003_harden_rls_policies.sql`.

Recommended practices:

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client bundles or browsers.
- Use the server endpoints for privileged operations instead of embedding admin client usage in client code.
- Rotate keys regularly and store secrets in secure environment variables or secret managers.
- Consider adding rate-limiting and request logging to the server endpoints if they will be publicly reachable.

How to call the job endpoints from server-side code or CI:

Example (Node / fetch):

```js
const res = await fetch(`${process.env.SERVER_BASE_URL}/api/jobs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-server-api-key': process.env.MCP_API_KEY },
  body: JSON.stringify({ name: 'scrape', args: { pageUrls: [...] } }),
});
```

If you want me to also add rate-limiting or audit logging middleware for these endpoints, tell me and I will add it.
