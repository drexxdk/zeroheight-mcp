#!/usr/bin/env node

/**
 * Test script for ZeroHeight MCP API Query functionality
 * This tests the Query ZeroHeight Data tool (assumes data was already scraped)
 * Run with: npx tsx scripts/test-api.ts
 */

const API_URL = 'http://localhost:3000/api/mcp';
const API_KEY = process.env.MCP_API_KEY;

if (!API_KEY) {
  console.error('❌ Error: MCP_API_KEY environment variable not set');
  console.log('');
  console.log('Set it with:');
  console.log('  export MCP_API_KEY="your-api-key-here"');
  console.log('  # or in PowerShell:');
  console.log('  $env:MCP_API_KEY = "your-api-key-here"');
  process.exit(1);
}

async function testApi() {
  console.log('🧪 Testing ZeroHeight MCP API...');
  console.log(`📍 API URL: ${API_URL}`);
  console.log(`🔑 API Key: ${API_KEY ? API_KEY.substring(0, 8) + '...' : 'NOT SET'}`);
  console.log('');

  try {
    // Test: Query ZeroHeight Data (assumes data was already scraped)
    console.log('🔍 Testing Query ZeroHeight Data...');
    const queryResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY!,
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'Query ZeroHeight Data',
          arguments: {
            search: 'color',
            includeImages: true,
            limit: 5
          }
        }
      })
    });

    if (!queryResponse.ok) {
      throw new Error(`HTTP ${queryResponse.status}: ${queryResponse.statusText}`);
    }

    const queryResult = await queryResponse.text();
    console.log('✅ Query request successful');
    console.log('📄 Response preview:', queryResult.substring(0, 500) + '...');
    console.log('');

    console.log('🎉 API test passed! The server is responding correctly.');
    console.log('💡 Note: This test assumes data has already been scraped.');
    console.log('   To scrape data, use the MCP client or call the Scrape tool directly.');

  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : String(error));
    console.log('');
    console.log('💡 Troubleshooting:');
    console.log('- Make sure the server is running: npm run dev');
    console.log('- Check that MCP_API_KEY is set correctly');
    console.log('- Verify the API URL is accessible');
    console.log('- Ensure data has been scraped previously (this test only queries)');
    process.exit(1);
  }
}

testApi();