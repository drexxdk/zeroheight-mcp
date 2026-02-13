#!/usr/bin/env tsx

/**
 * Test script to demonstrate all console log outputs from scrapeZeroheightProject.ts
 * This script prints out all the different console.log statements that can appear
 * during the scraping process.
 */

console.log("=== Zeroheight Scraper Console Log Test ===\n");

// Mock data for demonstration
const mockUrl = "https://company.zeroheight.com/p/123/design-system";
const mockPageUrls = [
  "https://company.zeroheight.com/p/123/getting-started",
  "https://company.zeroheight.com/p/456/components",
];
const mockProgressBar = "██████████████░░░░";
const mockCurrent = 129;
const mockTotal = 133;

// 1. Starting message
console.log("Starting Zeroheight project scrape...");

// 2. Navigation message
console.log(`Navigating to ${mockUrl}...`);

// 3. Password-related messages
console.log("Password provided, checking for login form...");
console.log("Found password input field, entering password...");
console.log("Password entered, waiting for login to process...");
console.log(`Current URL after password entry: ${mockUrl}`);
console.log("WARNING: Password input still visible - login may have failed");
console.log("Password input no longer visible - login appears successful");
console.log(`ERROR: Found "incorrect password" error - login likely failed`);
console.log("No password input field found on the page");
console.log("No password provided, proceeding without login");

// 4. Page loading messages
console.log(`Final URL after loading: ${mockUrl}`);
console.log(`Page title: Design System - Zeroheight`);
console.log(`Content container found: true`);
console.log(`Body text length: 15432 characters`);

// 5. Project setup messages
console.log(`Project URL: /p/123/design-system`);
console.log(`Allowed hostname: company.zeroheight.com`);

// 6. URL configuration messages
console.log(`Using ${mockPageUrls.length} specific page URLs provided`);
console.log(
  `Page URLs: ${mockPageUrls.map((url) => url.split("/").pop()).join(", ")}`,
);
console.log(
  "No specific page URLs provided, discovering links automatically...",
);
console.log(`Total unique links to process: 150`);

// 7. Progress messages (image processing)
console.log(
  `${mockProgressBar} [${mockCurrent}/${mockTotal}] 🚫 Skipping image logo.png - already processed`,
);
console.log(
  `${mockProgressBar} [${mockCurrent}/${mockTotal}] 🖼️ Processing image 5 for page: button-component.png`,
);

// 8. Page processing messages
console.log(
  `${mockProgressBar} [${mockCurrent}/${mockTotal}] ↪️ Redirect detected: /p/123/old-page -> /p/456/new-page`,
);
console.log(
  `${mockProgressBar} [${mockCurrent}/${mockTotal}] 🚫 Skipping /p/123/old-page - final URL /p/456/new-page already processed`,
);
console.log(
  `${mockProgressBar} [${mockCurrent}/${mockTotal}] 📄 Processing page 42: /p/789/components`,
);

// 9. Link discovery messages
console.log(
  `${mockProgressBar} [${mockCurrent}/${mockTotal}] 🔍 Discovering new links on this page (automatic mode)`,
);
console.log(
  `${mockProgressBar} [${mockCurrent}/${mockTotal}] 🔗 Discovered new link: /p/101/forms`,
);

console.log("\n=== Test completed - All console log types demonstrated ===");
