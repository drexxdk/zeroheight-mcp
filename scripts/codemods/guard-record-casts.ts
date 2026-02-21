#!/usr/bin/env tsx
import { Project, SyntaxKind } from "ts-morph";
import path from "path";

// Usage: npx tsx scripts/codemods/guard-record-casts.ts <glob|dir> [--dry-run]

const args = process.argv.slice(2);
const target = args[0] || "src";
const dryRun = args.includes("--dry-run");

const project = new Project({ tsConfigFilePath: "tsconfig.json" });
const pattern = path.join(process.cwd(), target, "**/*.{ts,tsx,js,jsx}");
project.addSourceFilesAtPaths(pattern);

let sourceFiles = project.getSourceFiles();
// Exclude declaration files which shouldn't have imports inserted
sourceFiles = sourceFiles.filter((sf) => !sf.getFilePath().endsWith(".d.ts"));
import logger from "../../src/utils/logger";
logger.log(`Found ${sourceFiles.length} files under ${target}`);

for (const sf of sourceFiles) {
  let modified = false;

  // Ensure isRecord import exists (from utils guard)
  const hasImport = sf
    .getImportDeclarations()
    .some(
      (d) =>
        d.getModuleSpecifierValue().endsWith("/utils/common/typeGuards") ||
        d.getModuleSpecifierValue() === "@/utils/common/typeGuards",
    );
  if (!hasImport) {
    const full = sf.getFullText();
    // If file starts with a shebang, insert import after the first line
    if (full.startsWith("#!")) {
      const firstNewline = full.indexOf("\n");
      const insertPos = firstNewline >= 0 ? firstNewline + 1 : 0;
      sf.insertText(
        insertPos,
        `import { isRecord } from "@/utils/common/typeGuards";\n`,
      );
    } else {
      sf.insertImportDeclaration(0, {
        namedImports: ["isRecord"],
        moduleSpecifier: "@/utils/common/typeGuards",
      });
    }
    modified = true;
  }

  const asExprs = sf.getDescendantsOfKind(SyntaxKind.AsExpression);
  for (const asExpr of asExprs) {
    const typeNode = asExpr.getTypeNode();
    if (!typeNode) continue;
    const typeText = typeNode.getText();
    if (!/Record\s*<\s*string\s*,\s*unknown\s*>/.test(typeText)) continue;

    const exprText = asExpr.getExpression().getText();
    const replacement = `(() => { const __tmp = ${exprText}; return isRecord(__tmp) ? (__tmp as ${typeText}) : __tmp; })()`;
    asExpr.replaceWithText(replacement);
    modified = true;
  }

  if (modified) {
    if (dryRun) {
      logger.log(`[dry-run] would modify: ${sf.getFilePath()}`);
    } else {
      sf.saveSync();
      logger.log(`Modified: ${sf.getFilePath()}`);
    }
  }
}

logger.log(dryRun ? "Dry run complete." : "Codemod complete.");
