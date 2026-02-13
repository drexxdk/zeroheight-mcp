import { callMCPTool } from "./mcp-call.js";

async function testScraper() {
  const result = await callMCPTool("scrape-zeroheight-project", {
    pageUrls: [
      "https://designsystem.lruddannelse.dk/10548dffa/p/51380f-graph-patterns-wip",
    ],
  });
  console.log("Result:", result);
}

testScraper();
