#!/usr/bin/env node
/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unused-vars, no-console */
// Scan staged files for `debugger` statements and fail if any are found.
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

function getStagedFiles() {
  const out = execSync("git diff --cached --name-only --diff-filter=ACMRT", {
    encoding: "utf8",
  }).trim();
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fileHasDebugger(content) {
  return /\bdebugger\b/.test(content);
}

const staged = getStagedFiles();
const checkExt = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"];
let found = false;
for (const file of staged) {
  const ext = path.extname(file).toLowerCase();
  if (!checkExt.includes(ext)) continue;
  let content = "";
  try {
    // Read staged version via git show to ensure we scan the committed content
    content = execSync(`git show :${file}`, { encoding: "utf8" });
  } catch (e) {
    // Fallback to filesystem for untracked/staged new files
    try {
      content = fs.readFileSync(file, { encoding: "utf8" });
    } catch (e2) {
      continue;
    }
  }
  if (fileHasDebugger(content)) {
    // Use logger via console substitution here since this script runs in pre-commit
    // and importing the project's logger may not be desirable; keep messages on stderr
    console.error(`ERROR: Found ` + "`debugger`" + ` in staged file: ${file}`);
    // Show matching lines
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (/\bdebugger\b/.test(line)) {
        console.error(`${file}:${idx + 1}: ${line.trim()}`);
      }
    });
    found = true;
  }
}

if (found) {
  console.error(
    "Commit aborted: remove debugger statements before committing.",
  );
  process.exit(1);
}
process.exit(0);
