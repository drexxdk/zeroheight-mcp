import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Project rule: forbid direct access to `process.env` outside of config.ts
  {
    rules: {
      // Allow `debugger` during development; we'll block it at commit-time via git hook
      "no-debugger": "off",
      // Disallow direct `console` usage by default; allow only in dedicated logger and tooling files via overrides
      "no-console": "error",
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Do not access process.env directly. Import values from src/utils/config.ts instead.",
        },
      ],
      // Disallow empty catch blocks; require at least logging or rethrowing.
      "no-empty": [
        "error",
        {
          allowEmptyCatch: false,
        },
      ],
      // Require explicit return types and module boundary types while auditing
      // (temporarily enabled to collect missing explicit-type locations).
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      "@typescript-eslint/explicit-module-boundary-types": ["error"],
      // Forbid use of `any` to improve type safety
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["src/utils/config.ts"],
    rules: {
      "no-restricted-properties": "off",
    },
  },
  // Allow limited console usage only in the central logger
  {
    files: ["src/utils/logger.ts"],
    rules: {
      "no-console": ["error", { allow: ["log", "warn", "error", "debug"] }],
    },
  },
  // Project rule: discourage casts to `Record<string, unknown>` which bypass
  // TypeScript's intent. Prefer runtime guards (`isRecord`) or explicit types.
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression[typeAnnotation.typeName.name='Record']",
          message:
            "Avoid casting to Record<string, unknown> (e.g. `as Record<string, unknown>`). Use runtime guards or explicit types instead.",
        },
        {
          selector: "TSAsExpression[typeAnnotation.typeName.name='any']",
          message:
            "Avoid casting to `any`; use concrete types or runtime checks.",
        },
        {
          selector: "TSAsExpression[typeAnnotation.typeName.name='unknown']",
          message:
            "Avoid casting to `unknown` directly; prefer proper narrowing or runtime guards.",
        },
      ],
    },
  },
]);

export default eslintConfig;
