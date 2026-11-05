import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Independently pinned library verifiers use the CommonJS acceptance protocol.
  { files: ["native/*.cjs", "native/*_harness.js"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "lib/native/**",
    ".native-inputs/**",
    // The local agent package has its own tsconfig and tests.
    "packages/**",
  ]),
]);

export default eslintConfig;
