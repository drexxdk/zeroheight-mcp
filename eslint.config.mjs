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
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Do not access process.env directly. Import values from src/utils/config.ts instead.",
        },
      ],
    },
  },
  {
    files: ["src/utils/config.ts"],
    rules: {
      "no-restricted-properties": "off",
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
      ],
    },
  },
]);

export default eslintConfig;
