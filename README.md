# Zeroheight MCP Server

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

A powerful Model Context Protocol (MCP) server that scrapes, indexes, and provides intelligent querying capabilities for Zeroheight design system documentation. Built for design systems teams who need programmatic access to their component libraries and design guidelines.

## ✨ Features

- **Intelligent Scraping**: Automatically discovers and scrapes all pages, components, and documentation from Zeroheight design systems with image processing and deduplication
- **Powerful Search**: Full-text search across titles, content, and URLs with flexible query options and complete Supabase storage URLs for images
- **MCP Integration**: Built on the Model Context Protocol for seamless integration with AI assistants and design tools
- **Image Management**: Automatically downloads, processes, and stores design system images with MD5-based deduplication
- **Database Tools**: Complete database inspection and management with SQL execution, schema inspection, and migration tracking
- **Secure Access**: Enterprise-grade authentication with API key validation
- **High Performance**: Optimized for speed with bulk database operations and efficient caching

## �️ Image Management

The scraper automatically handles image processing with intelligent filtering and optimization:

### Supported Image Types

- **Supported**: PNG, JPG/JPEG, WebP, GIF, SVG
- **Filtered Out**: GIF and SVG formats are excluded from processing to focus on static design assets

### Upload Process

- Images are downloaded from Zeroheight and uploaded to Supabase Storage buckets
- Each image gets a unique path based on MD5 hash for efficient deduplication
- Query results include complete Supabase storage URLs for direct access

### Duplicate Prevention

- MD5 hashing ensures identical images are never uploaded twice
- Existing images are detected and reused instead of re-uploading
- Storage costs are minimized through intelligent deduplication

### Image Optimization

- **Format Conversion**: All images are converted to JPEG format for consistency
- **Quality Reduction**: Image quality is reduced to 80% to balance file size and visual quality
- **Resolution Limiting**: Images are resized to a maximum of 1920px on the longest side
- **Aspect Ratio Preservation**: Original aspect ratios are maintained during resizing

## 🔍 Page Discovery and Redirect Handling

The scraper intelligently discovers and processes pages while preventing duplicate content:

### Page Discovery

- Starts with the configured Zeroheight project URL
- Automatically finds all linked pages within the same domain
- Discovers both direct page links (`/p/page-slug`) and navigation links
- Continues discovering new links as it processes each page

### Redirect Detection

- After navigating to each URL, checks the final destination URL
- Detects when URLs redirect to other pages (common in Zeroheight)
- Uses the final URL for storage instead of the original redirecting URL

### Duplicate Prevention

- Maintains a set of processed URLs to avoid re-processing the same content
- When a redirect leads to an already processed page, skips processing entirely
- Progress counter only increments for actually processed unique pages
- Database storage uses upsert operations to handle any remaining duplicates

### Link Discovery Limits

- When a page limit is set (e.g., `limit: 3`), stops discovering new links once the limit is reached
- Prevents the processing queue from growing beyond the specified number of pages
- Ensures predictable execution time and resource usage

## 📋 Console Output Example

Here's an example of the console output when running the scraper with a limit of 3 pages:

```
[dotenv@17.2.4] injecting env (5) from .env.local
Starting Zeroheight project scrape...
Navigating to https://designsystem.lruddannelse.dk...
Password provided, checking for login form...
Found password input field, entering password...
Password entered, waiting for login to process...
Current URL after password entry: https://designsystem.lruddannelse.dk/10548dffa/p/3441e1-lindhardt-og-ringhof-uddannelse-design-system
Password input no longer visible - login appears successful
Found 23 navigation links after login attempt
Final URL after loading: https://designsystem.lruddannelse.dk/10548dffa/p/3441e1-lindhardt-og-ringhof-uddannelse-design-system
Page title: Lindhardt og Ringhof Uddannelse Design System
Content container found: true
Body text length: 51103 characters
Project URL: https://designsystem.lruddannelse.dk
Allowed hostname: designsystem.lruddannelse.dk
Found 29 total raw links on page
Sample raw links: https://designsystem.lruddannelse.dk/10548dffa/p/10548dffa, https://designsystem.lruddannelse.dk/10548dffa/n/326d4d, ...
Found 0 links on main page
Found 0 Zeroheight page links (/p/ pattern)
Sample ZH page links:
Current page URL: https://designsystem.lruddannelse.dk/10548dffa/p/3441e1-lindhardt-og-ringhof-uddannelse-design-system
Total unique links to process: 1
[████████████████████] Processing page 1/3: https://designsystem.lruddannelse.dk/10548dffa/p/3441e1-lindhardt-og-ringhof-uddannelse-design-system
Discovered new link: https://designsystem.lruddannelse.dk/10548dffa/p/10548dffa
Discovered new link: https://designsystem.lruddannelse.dk/10548dffa/n/326d4d
Discovered new link: https://designsystem.lruddannelse.dk/10548dffa/n/52db31
... (more discovered links)
Redirect detected: https://designsystem.lruddannelse.dk/10548dffa/p/10548dffa -> https://designsystem.lruddannelse.dk/10548dffa/p/3441e1-lindhardt-og-ringhof-uddannelse-design-system
Skipping https://designsystem.lruddannelse.dk/10548dffa/p/10548dffa - final URL https://designsystem.lruddannelse.dk/10548dffa/p/3441e1-lindhardt-og-ringhof-uddannelse-design-system already processed
Redirect detected: https://designsystem.lruddannelse.dk/10548dffa/n/326d4d -> https://designsystem.lruddannelse.dk/10548dffa/p/256325-introduktion-til-lindhardt-og-ringhof-uddannelse
[█████████████░░░░░░░] Processing page 2/3: https://designsystem.lruddannelse.dk/10548dffa/p/256325-introduktion-til-lindhardt-og-ringhof-uddannelse
... (more processing output)
[████████████████████] Processing page 3/3: https://designsystem.lruddannelse.dk/10548dffa/p/321296-brandfortlling
Collected 3 pages for bulk insertion
Successfully inserted 3 pages
[██░░░░░░░░░░░░░░░░░░] Processing image 1/13: ze9jax4wepR4ylr5_4944A.png
[███░░░░░░░░░░░░░░░░░] Processing image 2/13: yoh8TcjKEP4TGKC6F3A9wQ.png
... (image processing continues)
Successfully inserted 2 images
Scraping completed successfully
```

### Output Explanation

- **Navigation & Authentication**: Shows login process and initial page loading
- **Link Discovery**: Lists newly discovered links as they're found
- **Redirect Detection**: Identifies when URLs redirect and skips duplicates
- **Progress Tracking**: Visual progress bars showing page processing status
- **Image Processing**: Individual progress for each image being optimized and uploaded
- **Final Summary**: Reports total pages and images processed successfully

## �🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- A Zeroheight design system project URL
- API key for authentication

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/drexxdk/zeroheight-mcp.git
   cd zeroheight-mcp
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure environment variables:**

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with your Zeroheight project details:

   ```env
   ZEROHEIGHT_PROJECT_URL=https://your-project.zeroheight.com/p/project-id
   ZEROHEIGHT_PROJECT_PASSWORD=your-password-if-required
   MCP_API_KEY=your-secure-api-key
   ```

4. **Start the development server:**

   ```bash
   npm run dev
   ```

5. **Test the setup:**
   ```bash
   npm run test-api
   ```

## 🔧 Configuration

### Environment Variables

| Variable                      | Description                             | Required         |
| ----------------------------- | --------------------------------------- | ---------------- |
| `ZEROHEIGHT_PROJECT_URL`      | URL of the Zeroheight project to scrape | Yes              |
| `ZEROHEIGHT_PROJECT_PASSWORD` | Password if project is protected        | No               |
| `MCP_API_KEY`                 | API key for server authentication       | Yes (production) |

### MCP Client Configuration

Copy the MCP configuration for your preferred setup:

**Local Development:**

```json
{
  "mcpServers": {
    "zeroheight-scraper": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:3000/api/mcp"],
      "env": {
        "MCP_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Production (Vercel):**

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

## 📚 API Reference

### Tools

#### 1. Scrape Zeroheight Project

Automatically discovers and scrapes all pages from your configured Zeroheight design system, including content and images with deduplication.

**Parameters:** None (uses environment variables)

**Example:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "scrape-zeroheight-project",
    "arguments": {}
  }
}
```

#### 2. Query Zeroheight Data

Queries the cached Zeroheight data with flexible search options. Returns complete Supabase storage URLs for images.

**Parameters:**

- `search` (optional): Search term for titles or content
- `url` (optional): Specific page URL to retrieve
- `includeImages` (optional, default: true): Include image data with full storage URLs
- `limit` (optional, default: 10): Maximum results

**Examples:**

```json
// Get all pages (limited to 10)
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "query-zeroheight-data",
    "arguments": {}
  }
}

// Search for pages containing "brand"
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "query-zeroheight-data",
    "arguments": {
      "search": "brand",
      "includeImages": true
    }
  }
}

// Get specific page by URL
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "query-zeroheight-data",
    "arguments": {
      "url": "https://example.zeroheight.com/p/project/page-slug",
      "includeImages": true
    }
  }
}
```

## 🖥️ CLI Tool

A convenient command-line interface for testing and interacting with MCP tools directly.

### Usage

```bash
# Show help and available tools
npm run mcp-call -- --help

# Call a tool without arguments
npm run mcp-call -- "List Tables"

# Call a tool with JSON arguments
npm run mcp-call -- "Query Zeroheight Data" '{"search": "button", "limit": 5}'

# Or use directly with tsx
npx tsx scripts/mcp-call.ts "List Tables"
```

### Available Tools

- **scrape-zeroheight-project**: Automatically discovers and scrapes all pages from Zeroheight design systems with image processing
- **query-zeroheight-data**: Searches cached design system data with full-text search, returns complete Supabase storage URLs for images
- **clear-zeroheight-data**: Removes all cached Zeroheight data and images (requires explicit API key confirmation)
- **execute-sql**: Executes raw SQL queries directly on the Supabase database
- **list-tables**: Lists all tables in the database schemas
- **get-database-schema**: Retrieves TypeScript type definitions for the complete database schema
- **get-project-url**: Returns the Supabase project API URL
- **get-publishable-api-keys**: Shows all publishable API keys for the project
- **list-migrations**: Lists all database migrations in chronological order
- **get-logs**: Retrieves recent logs from the Supabase project database
- **get-database-types**: Retrieves TypeScript type definitions for the database schema

### Examples

```bash
# Scrape Zeroheight design system (discovers all pages automatically)
npm run mcp-call -- "scrape-zeroheight-project"

# Query for specific content with images
npm run mcp-call -- "query-zeroheight-data" '{"search": "color palette", "includeImages": true}'

# Get a specific page by URL
npm run mcp-call -- "query-zeroheight-data" '{"url": "https://example.zeroheight.com/p/project/page-slug"}'

# List all database tables
npm run mcp-call -- "list-tables"

# Execute SQL queries
npm run mcp-call -- "execute-sql" '{"query": "SELECT COUNT(*) FROM pages;"}'

# Get database schema types
npm run mcp-call -- "get-database-schema"

# Clear all cached data (requires API key)
npm run mcp-call -- "clear-zeroheight-data" '{"apiKey": "your-mcp-api-key"}'
```

## 🧪 Testing

### HTTP API Testing

**Scrape Project:**

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"scrape-zeroheight-project","arguments":{}}}'
```

**Query Data:**

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"query-zeroheight-data","arguments":{"search":"color"}}}'
```

**Execute SQL:**

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"execute-sql","arguments":{"query":"SELECT COUNT(*) FROM pages;"}}}'
```

### PowerShell Testing

```powershell
# Set API key
$env:MCP_API_KEY = "your-api-key-here"

# Scrape project
Invoke-RestMethod -Uri "http://localhost:3000/api/mcp" -Method POST `
  -Headers @{"Content-Type"="application/json"; "X-API-Key"=$env:MCP_API_KEY; "Accept"="application/json, text/event-stream"} `
  -Body '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"scrape-zeroheight-project","arguments":{}}}' | Format-List

# Query data
Invoke-RestMethod -Uri "http://localhost:3000/api/mcp" -Method POST `
  -Headers @{"Content-Type"="application/json"; "X-API-Key"=$env:MCP_API_KEY; "Accept"="application/json, text/event-stream"} `
  -Body '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"query-zeroheight-data","arguments":{"search":"color"}}}' | Format-List

# Execute SQL
Invoke-RestMethod -Uri "http://localhost:3000/api/mcp" -Method POST `
  -Headers @{"Content-Type"="application/json"; "X-API-Key"=$env:MCP_API_KEY; "Accept"="application/json, text/event-stream"} `
  -Body '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"execute-sql","arguments":{"query":"SELECT COUNT(*) FROM pages;"}}}' | Format-List
```

### Automated Testing

Run the built-in test suite:

```bash
npm run test-api
```

## 🔒 Security

This MCP server uses API key authentication. The API key should be:

- Set as `MCP_API_KEY` environment variable
- Passed in requests via:
  - `Authorization: Bearer <your-api-key>` header (recommended)
  - `X-API-Key: <your-api-key>` header
  - `?api_key=<your-api-key>` query parameter (fallback)

**Important:** Never commit API keys to version control. For production deployments, set the `MCP_API_KEY` environment variable in your hosting platform (Vercel, etc.).

## 🗄️ Database Schema

The server uses Supabase with the following tables:

- **pages**: Stores page content
  - `id`: Primary key
  - `url`: Page URL
  - `title`: Page title
  - `content`: Page content (markdown)
  - `scraped_at`: Timestamp

- **images**: Stores image references
  - `id`: Primary key
  - `page_id`: Foreign key to pages
  - `original_url`: Original image URL
  - `local_path`: Local storage path

## 🚀 Deployment

### Vercel (Recommended)

1. **Connect your repository:**

   ```bash
   # Install Vercel CLI
   npm i -g vercel

   # Deploy
   vercel
   ```

2. **Set environment variables in Vercel:**
   - Go to your project settings
   - Add `MCP_API_KEY` with a secure random value
   - Add `ZEROHEIGHT_PROJECT_URL` and `ZEROHEIGHT_PROJECT_PASSWORD` if needed

3. **Configure your MCP client** with the production URL and API key.

### Other Platforms

The server can be deployed to any platform supporting Node.js:

```bash
npm run build
npm start
```

## 🐛 Troubleshooting

### Common Issues

**401 Unauthorized**

- Check that `MCP_API_KEY` is set correctly
- Verify the API key is included in request headers

**406 Not Acceptable**

- Add `Accept: application/json, text/event-stream` header

**Connection Refused**

- Ensure the server is running (`npm run dev`)
- Check the correct port (default: 3000)

**Scraping Fails**

- Verify `ZEROHEIGHT_PROJECT_URL` is accessible
- Check `ZEROHEIGHT_PROJECT_PASSWORD` if required
- Ensure the project allows scraping

### Debug Mode

Enable verbose logging by setting:

```env
DEBUG=mcp-server:*
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -am 'Add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Submit a pull request

### Development Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm run test-api

# Lint code
npm run lint

# Generate database types
npm run generate-database-types
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) for the protocol specification
- [Zeroheight](https://zeroheight.com/) for their design system platform
- [Next.js](https://nextjs.org/) for the web framework
- [Supabase](https://supabase.com/) for the database and storage

---

Built with ❤️ using Next.js, TypeScript, and the Model Context Protocol
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

````

## 🐛 Troubleshooting

### Common Issues

**401 Unauthorized**
- Check that `MCP_API_KEY` is set correctly
- Verify the API key is included in request headers

**406 Not Acceptable**
- Add `Accept: application/json, text/event-stream` header

**Connection Refused**
- Ensure the server is running (`npm run dev`)
- Check the correct port (default: 3000)

**Scraping Fails**
- Verify `ZEROHEIGHT_PROJECT_URL` is accessible
- Check `ZEROHEIGHT_PROJECT_PASSWORD` if required
- Ensure the project allows scraping

### Debug Mode

Enable verbose logging by setting:
```env
DEBUG=mcp-server:*
````

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -am 'Add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Submit a pull request

### Development Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm run test-api

# Lint code
npm run lint

# Generate database types
npm run generate-database-types
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) for the protocol specification
- [Zeroheight](https://zeroheight.com/) for their design system platform
- [Next.js](https://nextjs.org/) for the web framework
- [Supabase](https://supabase.com/) for the database and storage

---

Built with ❤️ using Next.js, TypeScript, and the Model Context Protocol
