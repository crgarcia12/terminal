import { build } from "esbuild";
import { mkdir, copyFile, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outdir = resolve(root, "dist");

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [resolve(root, "src/main.ts")],
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: false,
  outfile: resolve(outdir, "assets/app.js"),
  logLevel: "info",
});

const html = await readFile(resolve(root, "public/index.html"), "utf8");
await writeFile(resolve(outdir, "index.html"), html, "utf8");
console.log("[build] wrote", outdir);
