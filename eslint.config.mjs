import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "playwright-report/**",
    "test-results/**",
    ".local-evidence/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
