# ZeroHeight MCP Server

A Model Context Protocol (MCP) server for scraping and querying ZeroHeight design system projects.

## Security

This MCP server is secured with API key authentication. The API key is configured server-side only and is not stored in the repository for security reasons.

**Authentication Methods:**

- `Authorization: Bearer <your-api-key>` header (recommended)
- `X-API-Key: <your-api-key>` header
- `?api_key=<your-api-key>` query parameter (fallback)

**Important:** The `MCP_API_KEY` environment variable must be set in your Vercel deployment, not in local environment files.

## Tools

### 1. scrape_zeroheight_project

Scrapes a ZeroHeight design system project and caches the data in a SQLite database.

**Parameters:** None (uses environment variables)

**Environment Variables Required:**

- `ZEROHEIGHT_PROJECT_URL`: The URL of the ZeroHeight project to scrape
- `ZEROHEIGHT_PROJECT_PASSWORD`: Password if the project is protected (optional)

### 2. query_zeroheight_data

Queries the cached ZeroHeight data from the database with flexible search options.

**Parameters:**

- `search` (optional): Search term to find in page titles or content
- `url` (optional): Specific page URL to retrieve
- `includeImages` (optional, default: false): Whether to include image data in the response
- `limit` (optional, default: 10): Maximum number of results to return

**Examples:**

```json
// Get all pages (limited to 10)
{
  "name": "query_zeroheight_data",
  "arguments": {}
}

// Search for pages containing "brand"
{
  "name": "query_zeroheight_data",
  "arguments": {
    "search": "brand",
    "includeImages": true
  }
}

// Get specific page by URL
{
  "name": "query_zeroheight_data",
  "arguments": {
    "url": "https://example.zeroheight.com/project/p/page-slug",
    "includeImages": true
  }
## API Usage Examples

### Raw HTTP Calls (for testing/debugging)

For testing the MCP server directly via HTTP, use these examples:

**Scrape ZeroHeight Project:**
```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"Scrape ZeroHeight Project","arguments":{}}}'
```

**Query ZeroHeight Data:**
```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"Query ZeroHeight Data","arguments":{"search":"color"}}}'
```

**PowerShell Examples:**
```powershell
# Set API key environment variable
$env:MCP_API_KEY = "your-api-key-here"

# Scrape project
Invoke-RestMethod -Uri "http://localhost:3000/api/mcp" -Method POST `
  -Headers @{"Content-Type"="application/json"; "X-API-Key"=$env:MCP_API_KEY; "Accept"="application/json, text/event-stream"} `
  -Body '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"Scrape ZeroHeight Project","arguments":{}}}' | Format-List

# Query data
Invoke-RestMethod -Uri "http://localhost:3000/api/mcp" -Method POST `
  -Headers @{"Content-Type"="application/json"; "X-API-Key"=$env:MCP_API_KEY; "Accept"="application/json, text/event-stream"} `
  -Body '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"Query ZeroHeight Data","arguments":{"search":"color"}}}' | Format-List
```

**Required Headers:**
- `Content-Type: application/json` - JSON-RPC request format
- `X-API-Key: <your-key>` - Authentication (or use `Authorization: Bearer <your-key>`)
- `Accept: application/json, text/event-stream` - Required for MCP streaming responses

**Environment Setup:**
```bash
# Set the API key in your shell session
export MCP_API_KEY="your-api-key-here"
# Or for PowerShell:
$env:MCP_API_KEY = "your-api-key-here"
```

## Troubleshooting

### Common Errors

**401 Unauthorized:**
- **Cause:** Missing or invalid API key
- **Solution:** Set `MCP_API_KEY` environment variable and include in request headers

**406 Not Acceptable:**
- **Cause:** Missing required Accept header for JSON-RPC streaming
- **Solution:** Add `Accept: application/json, text/event-stream` header

**Connection Refused:**
- **Cause:** Server not running
- **Solution:** Run `npm run dev` first

**Test Your Setup:**
```bash
npm run test-api
```

This will run automated tests to verify your API key and server configuration.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and configure your environment variables:
   - `ZEROHEIGHT_PROJECT_URL`: The URL of the ZeroHeight project to scrape
   - `ZEROHEIGHT_PROJECT_PASSWORD`: Password if the project is protected (optional)
3. **Configure API Key on Vercel**: Set `MCP_API_KEY` as an environment variable in your Vercel deployment:
   - Go to [vercel.com](https://vercel.com) → Your Project → Settings → Environment Variables
   - Add `MCP_API_KEY` with a secure random value
4. Run the scraper: `npx tsx scrape.ts` (optional, for testing)
5. Test the API: `npm run test-api` (requires MCP_API_KEY environment variable and pre-scraped data)

## MCP Configuration

Copy `.vscode/mcp.json.example` to `.vscode/mcp.json` and configure it with your actual API key.

### Production (Vercel)

To connect to the deployed MCP server, configure your MCP client with the API key passed as an Authorization header:

**Example MCP Configuration:**

```json
{
  "mcpServers": {
    "zeroheight-scraper": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://zeroheight-mcp.vercel.app/api/mcp",
        "--header",
        "Authorization: Bearer ${MCP_API_KEY}"
      ],
      "env": {
        "MCP_API_KEY": "your-actual-api-key-here"
      }
    }
  }
}
```

**Important:** The MCP server requires a valid API key for all requests.

### Local Development

For local development and testing, you can temporarily set `MCP_API_KEY` in your local environment to test the authentication.

## Database Schema

- **pages**: Stores page content (id, url, title, content, scraped_at)
- **images**: Stores image references (id, page_id, original_url, local_path)

Images are downloaded locally and their paths are stored in the database for fast retrieval.
