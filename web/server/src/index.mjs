// Express static server + WebSocket PTY bridge.
// Listens on 0.0.0.0:$PORT. Serves the SPA at /. Provides WebSocket at /pty.
import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "8080", 10);

// node-pty is optional — fall back to plain child_process if unavailable
let pty = null;
try {
  pty = (await import("node-pty")).default ?? (await import("node-pty"));
  console.log("[server] node-pty loaded");
} catch (e) {
  console.warn("[server] node-pty unavailable — using child_process fallback:", e?.message ?? e);
}

const shell =
  process.env.SHELL ||
  (process.platform === "win32" ? "powershell.exe" : "/bin/bash");

const distDir = resolve(__dirname, "../../app/dist");

const app = express();
app.disable("x-powered-by");
app.use(express.static(distDir, { fallthrough: true, index: "index.html" }));
app.get("/health", (_req, res) => res.json({ ok: true }));
// Always return index.html for unknown GETs (SPA-style)
app.get(/.*/, (req, res, next) => {
  if (req.path === "/pty") return next();
  res.sendFile(resolve(distDir, "index.html"), (err) => {
    if (err) res.status(404).send("not found");
  });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/pty" });

wss.on("connection", (ws, req) => {
  console.log("[pty] new connection from", req.socket.remoteAddress);
  let proc = null;
  let isPty = false;

  function startShell(cols, rows) {
    if (pty && typeof pty.spawn === "function") {
      try {
        proc = pty.spawn(shell, ["-i"], {
          name: "xterm-256color",
          cols, rows,
          cwd: process.env.HOME || "/tmp",
          env: { ...process.env, TERM: "xterm-256color" },
        });
        isPty = true;
        proc.onData((d) => { try { ws.send(d); } catch {} });
        proc.onExit(() => { try { ws.close(); } catch {} });
        return;
      } catch (e) {
        console.warn("[pty] spawn failed, falling back:", e.message);
      }
    }
    // Fallback: plain child_process. Not a real TTY but enough for demo.
    proc = spawn(shell, ["-i"], {
      env: { ...process.env, TERM: "xterm-256color", PS1: "$ " },
      cwd: process.env.HOME || "/tmp",
      stdio: ["pipe", "pipe", "pipe"],
    });
    isPty = false;
    proc.stdout.on("data", (b) => { try { ws.send(b); } catch {} });
    proc.stderr.on("data", (b) => { try { ws.send(b); } catch {} });
    proc.on("exit", () => { try { ws.close(); } catch {} });
    // Send a synthetic banner so users see *something* even before output.
    try { ws.send(`Welcome to Web Terminal (fallback shell, no PTY)\r\n`); } catch {}
  }

  // Default size; client will send a resize message immediately.
  startShell(80, 24);

  ws.on("message", (msg, isBinary) => {
    if (!isBinary) {
      const s = msg.toString();
      if (s.startsWith("{")) {
        try {
          const m = JSON.parse(s);
          if (m.type === "resize" && proc) {
            if (isPty && proc.resize) proc.resize(m.cols, m.rows);
          }
          return;
        } catch { /* fall through to write */ }
      }
      if (isPty) proc.write(s); else proc.stdin.write(s);
      return;
    }
    const buf = msg;
    if (isPty) proc.write(buf.toString("utf8"));
    else proc.stdin.write(buf);
  });

  ws.on("close", () => {
    try { if (isPty) proc.kill(); else proc.kill("SIGHUP"); } catch {}
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] listening on 0.0.0.0:${PORT}`);
  console.log(`[server] serving static from ${distDir}`);
});
