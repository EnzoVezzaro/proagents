/**
 * `npm run dev` — the whole project in one terminal:
 *
 *   [core]  tsc --watch   → dist/ (CLI/library build, rebuilds on save)
 *   [docs]  vitepress dev → http://localhost:5173/proagents/docs/
 *
 * Docs and the marketplace app are ONE VitePress site now: the app island
 * mounts on the home page and the React bundle hot-reloads through the same
 * dev server. Output is prefixed and cross-forwarded, so a crash in either
 * process is visible in the single terminal you're watching.
 *
 * Ctrl+C stops both. If one process dies, the other is taken down too.
 */
import { spawn } from "node:child_process";

const procs = [];

function run(name, color, args) {
  const child = spawn(process.execPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  const tag = `\x1b[${color}m[${name}]\x1b[0m`;
  const pipe = (src) => {
    src.setEncoding("utf8");
    let buf = "";
    src.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        console.log(`${tag} ${line}`);
      }
      if (buf) process.stdout.write(`${tag} ${buf}\r`);
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`${tag} exited (code ${code}) — shutting down the other process.`);
      shutdown(1);
    }
  });
  procs.push(child);
  return child;
}

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) {
    try {
      p.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("core", "33", ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json", "--watch", "--preserveWatchOutput"]);
run("docs", "35", ["node_modules/vitepress/bin/vitepress.js", "dev", "docs", "--port", "5173", "--strictPort"]);
