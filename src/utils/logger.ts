import { config } from "./config";

function prefix(): string {
  return `[${new Date().toISOString()}]`;
}

function log(...args: unknown[]): void {
  console.log(prefix(), ...args);
}

function warn(...args: unknown[]): void {
  console.warn(prefix(), ...args);
}

function error(...args: unknown[]): void {
  console.error(prefix(), ...args);
}

function debug(...args: unknown[]): void {
  const enabled = !!config.scraper.debug;
  if (!enabled) return;
  console.debug(prefix(), ...args);
}

const logger = { log, warn, error, debug } as const;

export default logger;
