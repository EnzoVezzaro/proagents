/**
 * Runs the merged site with one command: the marketplace SPA (Vite dev
 * server) and the VitePress docs server, each with its production-accurate
 * base path, plus cross-forwarded output so a crash in either is visible in
 * the single terminal you're watching.
 *
 *   http://localhost:5173/proagents/         — marketplace SPA
 *   http://localhost:4173/proagents/docs/    — docs
 *
 * The SPA's nav "Docs" link resolves to the local docs server in dev
 * (web/src/links.ts), so a developer can cross between the two surfaces
 * locally exactly as a visitor would in production.
 *
 * Ctrl+C stops both. If one process dies, the other is taken down too —
 * a half-running site is worse than a stopped one.
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
      // VitePress/Vite keep the spinner on one line; flush it so tail
      // state is still visible.
      if (buf) process.stdout.write(`${tag} ${buf}\r`);
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`${tag} exited (code ${code}) — shutting down the other server.`);
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

run("app", "36", ["node_modules/vite/bin/vite.js", "web", "--port", "5173", "--strictPort"]);
run("docs", "35", ["node_modules/vitepress/bin/vitepress.js", "dev", "web/docs", "--port", "4173", "--strictPort"]);
