#!/usr/bin/env node

/**
 * Test script for Zeroheight MCP API Query functionality
 * This tests the Query Zeroheight Data tool (assumes data was already scraped)
 * Run with: npx tsx src/e2e/api-mcp.test.ts
 */

async function testApi(): Promise<void> {
  // load env and config dynamically so TS path aliases resolve at runtime
  await import("dotenv/config");
  const cfg = await import("@/utils/config");
  const logger = (await import("../../src/utils/logger")).default;

  if (!cfg.config.env.zeroheightMcpAccessToken) {
    logger.error(
      "❌ Error: ZEROHEIGHT_MCP_ACCESS_TOKEN environment variable not set",
    );
    logger.log("");
    logger.log("Set it with:");
    logger.log('  export ZEROHEIGHT_MCP_ACCESS_TOKEN="your-api-key-here"');
    logger.log("  # or in PowerShell:");
    logger.log('  $env:ZEROHEIGHT_MCP_ACCESS_TOKEN = "your-api-key-here"');
    process.exit(1);
  }

  logger.log("🧪 Testing Zeroheight MCP API...");
  logger.log(`📍 API URL: ${cfg.config.server.mcpUrl}`);
  logger.log(
    `🔑 API Key: ${cfg.config.env.zeroheightMcpAccessToken ? cfg.config.env.zeroheightMcpAccessToken.substring(0, 8) + "..." : "NOT SET"}`,
  );
  logger.log("");

  try {
    // Test: Query Zeroheight Data (assumes data was already scraped)
    logger.log("🔍 Testing Query Zeroheight Data...");
    const queryResponse = await fetch(cfg.config.server.mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": cfg.config.env.zeroheightMcpAccessToken,
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "Query Zeroheight Data",
          arguments: {
            search: "color",
            includeImages: true,
            limit: 5,
          },
        },
      }),
    });

    if (!queryResponse.ok) {
      throw new Error(
        `HTTP ${queryResponse.status}: ${queryResponse.statusText}`,
      );
    }

    const queryResult = await queryResponse.text();
    logger.log("✅ Query request successful");
    logger.log("📄 Response preview:", queryResult.substring(0, 500) + "...");
    logger.log("");

    logger.log("🎉 API test passed! The server is responding correctly.");
    logger.log("💡 Note: This test assumes data has already been scraped.");
    logger.log(
      "   To scrape data, use the MCP client or call the Scrape tool directly.",
    );
  } catch (error) {
    logger.error(
      "❌ Test failed:",
      error instanceof Error ? error.message : String(error),
    );
    logger.log("");
    logger.log("💡 Troubleshooting:");
    logger.log("- Make sure the server is running: npm run dev");
    logger.log("- Check that ZEROHEIGHT_MCP_ACCESS_TOKEN is set correctly");
    logger.log("- Verify the API URL is accessible");
    logger.log(
      "- Ensure data has been scraped previously (this test only queries)",
    );
    process.exit(1);
  }
}

testApi();
