import { build } from "esbuild";
import { readFileSync } from "fs";
await build({
  entryPoints: ["server/function.js"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outfile: "dist-function/index.mjs",
  define: { __CONGEO_SCHEMA_SQL__: JSON.stringify(readFileSync("schema.sql", "utf8")) },
  banner: { js: "import{createRequire as ___cr}from'node:module';import{fileURLToPath as ___f}from'node:url';import{dirname as ___d}from'node:path';const require=___cr(import.meta.url);const __filename=___f(import.meta.url);const __dirname=___d(__filename);" },
});
console.log("Neon Function bundle: dist-function/index.mjs");
