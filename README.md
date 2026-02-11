# ZeroHeight MCP Server

A Model Context Protocol (MCP) server for scraping and querying ZeroHeight design system projects.

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
2. Set environment variables in `.env.local`
3. Run the scraper: `npx tsx scrape.ts` (optional, for testing)
4. Start the server: `npm run dev`

## Database Schema

- **pages**: Stores page content (id, url, title, content, scraped_at)
- **images**: Stores image references (id, page_id, original_url, local_path)

Images are downloaded locally and their paths are stored in the database for fast retrieval.
