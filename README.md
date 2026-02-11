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
}
```

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and configure your environment variables:
   - `ZEROHEIGHT_PROJECT_URL`: The URL of the ZeroHeight project to scrape
   - `ZEROHEIGHT_PROJECT_PASSWORD`: Password if the project is protected (optional)
3. **Configure API Key on Vercel**: Set `MCP_API_KEY` as an environment variable in your Vercel deployment:
   - Go to [vercel.com](https://vercel.com) → Your Project → Settings → Environment Variables
   - Add `MCP_API_KEY` with a secure random value
4. Run the scraper: `npx tsx scrape.ts` (optional, for testing)
5. Start the server: `npm run dev`

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
