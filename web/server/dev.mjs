// Dev entry: build app once and start server in same process.
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "../app");
const serverDir = resolve(here, "./");

function run(cmd, args, cwd) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd, stdio: "inherit" });
    p.on("exit", (c) => c === 0 ? res(0) : rej(new Error(`${cmd} exited ${c}`)));
  });
}

await run("node", ["scripts/build.mjs"], appDir);
await run("node", ["src/index.mjs"], serverDir);
