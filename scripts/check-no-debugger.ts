#!/usr/bin/env node
// Scan staged files for `debugger` statements and fail if any are found.
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

function getStagedFiles(): string[] {
  const out = execSync("git diff --cached --name-only --diff-filter=ACMRT", {
    encoding: "utf8",
  })
    ?.toString()
    ?.trim();
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripStringsAndComments(s: string): string {
  // Remove string literals (single, double, template) first to avoid
  // false positives inside quoted text. Then remove block and line comments.
  return s
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function fileHasDebugger(content: string): boolean {
  const cleaned = stripStringsAndComments(content);
  return /\bdebugger\b/.test(cleaned);
}

function main(): number {
  const staged = getStagedFiles();
  const checkExt = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"];
  let found = false;
  for (const file of staged) {
    const ext = path.extname(file).toLowerCase();
    if (!checkExt.includes(ext)) continue;
    let content = "";
    try {
      // Read staged version via git show to ensure we scan the committed content
      content = execSync(`git show :${file}`, { encoding: "utf8" }).toString();
    } catch (_e) {
      // Fallback to filesystem for untracked/staged new files
      try {
        content = fs.readFileSync(file, { encoding: "utf8" });
      } catch (_e2) {
        continue;
      }
    }
    if (fileHasDebugger(content)) {
      // Use stderr writes since we don't want to import project logger here.
      process.stderr.write(
        `ERROR: Found ` + "`debugger`" + ` in staged file: ${file}\n`,
      );
      // Show matching lines
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        const cleanedLine = stripStringsAndComments(line);
        if (/\bdebugger\b/.test(cleanedLine)) {
          process.stderr.write(`${file}:${idx + 1}: ${line.trim()}\n`);
        }
      });
      found = true;
    }
  }

  if (found) {
    process.stderr.write(
      "Commit aborted: remove debugger statements before committing.\n",
    );
    return 1;
  }
  return 0;
}

if (require.main === module) {
  process.exit(main());
}
