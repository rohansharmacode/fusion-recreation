// Minimal static file server for the built app.
//   node scripts/serve.mjs [--dir=dist] [--port=5173]
//   node scripts/serve.mjs --release                 # serve release/ (port 5174 unless --port)
//   node scripts/serve.mjs --dir=release --artifact  # simulate a sandboxed artifact host:
//        every response carries a strict Content-Security-Policy (no 'unsafe-eval', no inline
//        scripts, fetch only to this origin) plus CORS, and /__sandbox.html shows index.html inside an
//        <iframe sandbox="allow-scripts"> (opaque origin: no localStorage, no alert/confirm/prompt,
//        no popups, no <a download>, no fullscreen).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
  ".json": "application/json",
  ".wasm": "application/wasm", // occt.gz.wasm holds gzip data; the app inflates it itself
  ".gz": "application/octet-stream", // legacy occt.wasm.gz (no Content-Encoding on purpose)
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

/** CSP close to what a sandboxed artifact host allows: bundled scripts or the big public CDNs, no eval. */
export const ARTIFACT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'self'",
].join("; ");

const SANDBOX_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>sandboxed artifact simulation</title><link rel="icon" href="data:,">
<style>html,body{margin:0;height:100%;background:#888}iframe{border:0;width:100%;height:100%;display:block}</style></head>
<body><iframe id="artifact" src="index.html" sandbox="allow-scripts" allow="clipboard-write"></iframe></body></html>`;

export function serve({ dir = "dist", port = 5173, artifact = false, csp = artifact ? ARTIFACT_CSP : null, quiet = true } = {}) {
  const base = path.resolve(root, dir);
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end(); return; }
    const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
    if (artifact) headers["access-control-allow-origin"] = "*"; // opaque-origin (sandboxed) documents fetch cross-origin
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, headers).end(); return; }
    if (artifact && p === "/__sandbox.html") {
      res.writeHead(200, { ...headers, "content-type": MIME[".html"] }).end(SANDBOX_PAGE);
      return;
    }
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(base, p);
    if (!file.startsWith(base)) { res.writeHead(403, headers).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { ...headers, "content-type": "text/plain" }).end("not found"); return; }
      const h = { ...headers, "content-type": MIME[path.extname(file)] || "application/octet-stream", "content-length": data.length };
      if (csp && path.extname(file) === ".html") h["content-security-policy"] = csp;
      if (!quiet) console.log(`${req.method} ${p} ${data.length}`);
      res.writeHead(200, h);
      res.end(req.method === "HEAD" ? undefined : data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(port), "127.0.0.1", () => resolve(server));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const dir = args.dir || (args.release ? "release" : "dist");
  const port = Number(args.port || (args.release ? 5174 : 5173));
  const artifact = !!args.artifact;
  if (!fs.existsSync(path.resolve(root, dir, "index.html"))) {
    console.error(`${dir}/index.html not found — build first (npm run ${dir === "release" ? "release" : "build"})`);
    process.exit(1);
  }
  serve({ dir, port, artifact, quiet: !args.verbose }).then(() => {
    console.log(`serving ${dir} on http://127.0.0.1:${port}/`);
    if (artifact) console.log(`sandboxed artifact simulation: http://127.0.0.1:${port}/__sandbox.html`);
  }, (e) => { console.error(e.message || e); process.exit(1); });
}
