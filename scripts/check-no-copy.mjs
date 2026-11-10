// Clean-rebuild check: fails when a prose string in src/ matches a Fusion string table word for word.
// Usage: node scripts/check-no-copy.mjs "<Fusion webdeploy folder>"  (or set FUSION_INSTALL). Reads the install in place.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const INSTALL = process.argv[2] || process.env.FUSION_INSTALL, ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!INSTALL || !fs.existsSync(INSTALL)) { console.log("check-no-copy: no Fusion install given, skipped"); process.exit(0); }
function walk(d, pred, out = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, pred, out); else if (pred(p)) out.push(p); } return out; }
const norm = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/\n/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
const tables = walk(INSTALL, (p) => /StringTable[\/]en-US[\/].*\.xml$/.test(p));
const hay = norm(tables.map((f) => fs.readFileSync(f, "utf8")).join(" "));
const files = walk(path.join(ROOT, "src"), (p) => p.endsWith(".js"));
const re = /"((?:[^"\\n]|\.){24,})"|'((?:[^'\\n]|\.){24,})'|`([^`$]{24,})`/g;
let total = 0, hits = [], byFile = {};
for (const f of files) {
  const src = fs.readFileSync(f, "utf8"); let m;
  while ((m = re.exec(src))) {
    const s = norm(m[1] || m[2] || m[3]); if (!/[a-z]{2,} [a-z]{2,} [a-z]{2,} [a-z]{2,}/.test(s)) continue;
    total++; if (hay.includes(s)) { const r = path.relative(ROOT, f); hits.push([r, s]); byFile[r] = (byFile[r] || 0) + 1; }
  }
}
console.log(`check-no-copy: ${total} prose strings, ${hits.length} match Fusion string tables word for word`);
for (const [f, s] of hits) console.log("  " + f + ": " + s.slice(0, 120));
process.exit(hits.length ? 1 : 0);
