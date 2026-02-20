#!/usr/bin/env node

/**
 * Test script for Zeroheight MCP API Query functionality
 * This tests the Query Zeroheight Data tool (assumes data was already scraped)
 * Run with: npx tsx src/e2e/api-mcp.test.ts
 */

async function testApi(): Promise<void> {
  // load env and config dynamically so TS path aliases resolve at runtime
  await import("dotenv/config");
  const { ZEROHEIGHT_MCP_ACCESS_TOKEN, MCP_URL } =
    await import("@/utils/config");

  if (!ZEROHEIGHT_MCP_ACCESS_TOKEN) {
    console.error(
      "❌ Error: ZEROHEIGHT_MCP_ACCESS_TOKEN environment variable not set",
    );
    console.log("");
    console.log("Set it with:");
    console.log('  export ZEROHEIGHT_MCP_ACCESS_TOKEN="your-api-key-here"');
    console.log("  # or in PowerShell:");
    console.log('  $env:ZEROHEIGHT_MCP_ACCESS_TOKEN = "your-api-key-here"');
    process.exit(1);
  }

  console.log("🧪 Testing Zeroheight MCP API...");
  console.log(`📍 API URL: ${MCP_URL}`);
  console.log(
    `🔑 API Key: ${ZEROHEIGHT_MCP_ACCESS_TOKEN ? ZEROHEIGHT_MCP_ACCESS_TOKEN.substring(0, 8) + "..." : "NOT SET"}`,
  );
  console.log("");

  try {
    // Test: Query Zeroheight Data (assumes data was already scraped)
    console.log("🔍 Testing Query Zeroheight Data...");
    const queryResponse = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": ZEROHEIGHT_MCP_ACCESS_TOKEN,
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
    console.log("✅ Query request successful");
    console.log("📄 Response preview:", queryResult.substring(0, 500) + "...");
    console.log("");

    console.log("🎉 API test passed! The server is responding correctly.");
    console.log("💡 Note: This test assumes data has already been scraped.");
    console.log(
      "   To scrape data, use the MCP client or call the Scrape tool directly.",
    );
  } catch (error) {
    console.error(
      "❌ Test failed:",
      error instanceof Error ? error.message : String(error),
    );
    console.log("");
    console.log("💡 Troubleshooting:");
    console.log("- Make sure the server is running: npm run dev");
    console.log("- Check that ZEROHEIGHT_MCP_ACCESS_TOKEN is set correctly");
    console.log("- Verify the API URL is accessible");
    console.log(
      "- Ensure data has been scraped previously (this test only queries)",
    );
    process.exit(1);
  }
}

testApi();
