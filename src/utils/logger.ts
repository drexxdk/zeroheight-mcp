// import dotenv from "dotenv";

// dotenv.config({ path: ".env.local" });

import { config } from "./config";

function log(...args: unknown[]): void {
  console.log(...args);
}

function warn(...args: unknown[]): void {
  console.warn(...args);
}

function error(...args: unknown[]): void {
  console.error(args);
}

function debug(...args: unknown[]): void {
  const enabled = !!config.scraper.debug;
  if (!enabled) return;
  console.debug(...args);
}

const logger = { log, warn, error, debug } as const;

export default logger;
