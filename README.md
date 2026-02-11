# Zeroheight MCP Server

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

A powerful Model Context Protocol (MCP) server that scrapes, indexes, and provides intelligent querying capabilities for Zeroheight design system documentation. Built for design systems teams who need programmatic access to their component libraries and design guidelines.

## ✨ Features

- **Intelligent Scraping**: Automatically discovers and scrapes all pages, components, and documentation from Zeroheight design systems
- **Powerful Search**: Full-text search across titles, content, and URLs with flexible query options
- **MCP Integration**: Built on the Model Context Protocol for seamless integration with AI assistants and design tools
- **Image Management**: Automatically downloads, processes, and stores design system images and assets
- **Secure Access**: Enterprise-grade authentication with API key validation
- **High Performance**: Optimized for speed with bulk database operations and efficient caching

## 🚀 Quick Start

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

Scrapes a Zeroheight design system project and caches the data in the database.

**Parameters:** None (uses environment variables)

**Example:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "Scrape Zeroheight Project",
    "arguments": {}
  }
}
```

#### 2. Query Zeroheight Data

Queries the cached Zeroheight data with flexible search options.

**Parameters:**

- `search` (optional): Search term for titles or content
- `url` (optional): Specific page URL to retrieve
- `includeImages` (optional, default: false): Include image data
- `limit` (optional, default: 10): Maximum results

**Examples:**

```json
// Get all pages (limited to 10)
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "Query Zeroheight Data",
    "arguments": {}
  }
}

// Search for pages containing "brand"
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "Query Zeroheight Data",
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
    "name": "Query Zeroheight Data",
    "arguments": {
      "url": "https://example.zeroheight.com/p/project/page-slug",
      "includeImages": true
    }
  }
}
```

## 🧪 Testing

### HTTP API Testing

**Scrape Project:**

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"Scrape Zeroheight Project","arguments":{}}}'
```

**Query Data:**

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"Query Zeroheight Data","arguments":{"search":"color"}}}'
```

### PowerShell Testing

```powershell
# Set API key
$env:MCP_API_KEY = "your-api-key-here"

# Scrape project
Invoke-RestMethod -Uri "http://localhost:3000/api/mcp" -Method POST `
  -Headers @{"Content-Type"="application/json"; "X-API-Key"=$env:MCP_API_KEY; "Accept"="application/json, text/event-stream"} `
  -Body '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"Scrape Zeroheight Project","arguments":{}}}' | Format-List

# Query data
Invoke-RestMethod -Uri "http://localhost:3000/api/mcp" -Method POST `
  -Headers @{"Content-Type"="application/json"; "X-API-Key"=$env:MCP_API_KEY; "Accept"="application/json, text/event-stream"} `
  -Body '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"Query Zeroheight Data","arguments":{"search":"color"}}}' | Format-List
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
