import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Blob/object URLs cannot go through next/image, so plain <img> is intentional for local previews.
  { rules: { '@next/next/no-img-element': 'off' } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/**",
    "test-results/**",
    "playwright-report/**",
    "scripts/**",
  ]),
]);

export default eslintConfig;
