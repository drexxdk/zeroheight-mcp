import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintComments from "eslint-plugin-eslint-comments";
import eslintImport from "eslint-plugin-import";

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
    plugins: {
      "eslint-comments": eslintComments,
      "import": eslintImport,
    },
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
      // Disallow variable shadowing (core rule)
      "no-shadow": "error",
      // Prefer const where possible
      "prefer-const": "error",
      // Disallow disabling rules for specific IDs (configured list)
      "eslint-comments/no-unused-disable": "error",
      // Prevent importing devDependencies from source files
      "import/no-extraneous-dependencies": [
        "error",
        {
          "devDependencies": [
            "**/__tests__/**",
            "**/*.test.*",
            "scripts/**",
            "**/vitest.setup.*",
            "**/.husky/**",
            "eslint.config.mjs",
            "vitest.config.ts",
            "**/*.config.*",
            "scripts/**"
          ]
        }
      ],
      // Complexity thresholds
      "complexity": ["warn", 15],
      "max-lines-per-function": ["warn", { "max": 200, "skipComments": true, "skipBlankLines": true }],
      // Forbid the use of TypeScript `@ts-` comment directives (e.g. @ts-ignore)
      // Tests are allowed to opt-out via an override below.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": true,
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
        },
      ],
      // Allow intentionally unused variables/args prefixed with `_`.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Discourage general use of `as`/type assertions; prefer proper typing or runtime checks.
      // This is enforced as an error to prevent introducing new assertions.
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression",
          message:
            "Avoid using `as` type assertions to bypass TypeScript. Prefer proper types, runtime guards, or small typed fixtures.",
        },
        {
          selector: "TSTypeAssertion",
          message:
            "Avoid using `(<Type>value)` style type assertions. Prefer proper types or runtime validation instead.",
        },
      ],
      // Disallow using eslint-disable for specific rules that must not be bypassed.
      "eslint-comments/no-restricted-disable": [
        "error",
        "@typescript-eslint/no-explicit-any",
      ],
    },
  },
  // Allow ts-comment directives in tests where temporary type-workarounds are needed
  {
    files: ["src/**/__tests__/**"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
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
