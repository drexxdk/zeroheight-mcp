#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createJobInDb } from "@/tools/scraper/jobStore";

async function main() {
  const id = await createJobInDb("scrape-zeroheight-project", {
    pageUrls: null,
  });
  if (!id) {
    console.error("Failed to create job");
    process.exit(1);
  }
  console.log(id);
}

void main();
