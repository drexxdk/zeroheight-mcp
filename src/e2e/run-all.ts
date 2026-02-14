#!/usr/bin/env tsx
import { execSync } from "child_process";

const scripts = [
  "src/e2e/run-job-lifecycle.ts",
  "src/e2e/test-full-job-flow.ts",
  // add other e2e scripts as needed; keep ordered
];

for (const s of scripts) {
  console.log(`\n=== Running ${s} ===\n`);
  try {
    execSync(`npx tsx ${s}`, { stdio: "inherit" });
  } catch (e) {
    console.error(`Script ${s} failed:`, (e as Error).message || e);
    process.exit(1);
  }
}

console.log("All e2e scripts completed successfully.");
