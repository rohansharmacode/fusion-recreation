// T-spline mesh files (Insert T-Spline / Save *.tsm). The writer produces a plain-text control mesh:
//   tsm 1                       header
//   v x y z                     one line per control vertex (mm)
//   f i j k l ...               one line per face, 1-based vertex indices, counter-clockwise from outside
//   crease a b / cv i           creased edges / creased vertices
//   sym mirror ox oy oz nx ny nz | sym circular ox oy oz dx dy dz n
// The reader accepts that text, OBJ-style polygon meshes (v / f with "i/t/n" indices) and XML files that
// list vertices as x / y / z attributes (or "x y z" text) and faces as index lists.
import { tidy, orient, compact } from "./cage.js";

export function writeTSM(c, name = "Body") {
  const out = [`# T-Spline control mesh "${name}" (unofficial Fusion recreation, text TSM)`, "tsm 1"];
  for (const p of c.v) out.push(`v ${p.map((x) => +x.toFixed(6)).join(" ")}`);
  for (const f of c.f) out.push(`f ${f.map((i) => i + 1).join(" ")}`);
  for (const [a, b] of c.crease || []) out.push(`crease ${a + 1} ${b + 1}`);
  for (const v of c.cv || []) out.push(`cv ${v + 1}`);
  for (const v of c.frozen || []) out.push(`frozen ${v + 1}`);
  for (const v of c.iso || []) out.push(`iso ${v + 1}`);
  if (c.sym && c.sym.type === "mirror") for (const pl of c.sym.planes || []) out.push(`sym mirror ${[...pl.o, ...pl.n].map((x) => +x.toFixed(6)).join(" ")}`);
  if (c.sym && c.sym.type === "circular") out.push(`sym circular ${[...c.sym.o, ...c.sym.d].map((x) => +x.toFixed(6)).join(" ")} ${c.sym.count}`);
  return out.join("\n") + "\n";
}

function parseText(text) {
  const v = [], f = [], crease = [], cv = [], frozen = [], iso = [];
  let sym = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === "#") continue;
    const t = line.split(/\s+/);
    const k = t[0].toLowerCase();
    if (k === "v" && t.length >= 4) v.push([+t[1], +t[2], +t[3]]);
    else if (k === "f" && t.length >= 4) {
      const idx = t.slice(1).map((s) => parseInt(s.split("/")[0], 10)).map((i) => (i < 0 ? v.length + i : i - 1));
      f.push(idx);
    } else if (k === "crease" && t.length >= 3) crease.push([+t[1] - 1, +t[2] - 1]);
    else if (k === "cv" && t.length >= 2) cv.push(+t[1] - 1);
    else if (k === "frozen" && t.length >= 2) frozen.push(+t[1] - 1);
    else if (k === "iso" && t.length >= 2) iso.push(+t[1] - 1);
    else if (k === "sym" && t[1] === "mirror" && t.length >= 8) {
      const n = t.slice(2, 8).map(Number);
      sym = sym && sym.type === "mirror" ? sym : { type: "mirror", planes: [] };
      sym.planes.push({ o: n.slice(0, 3), n: n.slice(3, 6) });
    } else if (k === "sym" && t[1] === "circular" && t.length >= 9) {
      const n = t.slice(2, 9).map(Number);
      sym = { type: "circular", o: n.slice(0, 3), d: n.slice(3, 6), count: n[6] | 0 };
    }
  }
  return { v, f, crease, cv, frozen, iso, sym };
}
function parseXML(text) {
  const v = [], f = [];
  const num = (s) => (s || "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
  for (const m of text.matchAll(/<(?:vertex|vert|v|point|pt)\b([^>]*?)(?:\/>|>([^<]*)<\/(?:vertex|vert|v|point|pt)>)/gi)) {
    const attrs = m[1] || "";
    const x = /\bx\s*=\s*"([^"]+)"/i.exec(attrs), y = /\by\s*=\s*"([^"]+)"/i.exec(attrs), z = /\bz\s*=\s*"([^"]+)"/i.exec(attrs);
    if (x && y && z) v.push([+x[1], +y[1], +z[1]]);
    else { const n = num(m[2] || (/\b(?:pos|position|p)\s*=\s*"([^"]+)"/i.exec(attrs) || [])[1]); if (n.length >= 3) v.push(n.slice(0, 3)); }
  }
  for (const m of text.matchAll(/<(?:face|f|polygon|poly)\b([^>]*?)(?:\/>|>([^<]*)<\/(?:face|f|polygon|poly)>)/gi)) {
    const attrs = m[1] || "";
    const n = num(m[2] || (/\b(?:v|verts|vertices|indices|idx)\s*=\s*"([^"]+)"/i.exec(attrs) || [])[1]);
    if (n.length >= 3) f.push(n);
  }
  // 1-based lists (no index 0 anywhere and the largest index equals the vertex count)
  const max = Math.max(-1, ...f.flat());
  if (f.length && !f.flat().includes(0) && max === v.length) for (const fc of f) for (let i = 0; i < fc.length; i++) fc[i] -= 1;
  return { v, f, crease: [], cv: [], sym: null };
}

/** Parse a TSM / OBJ / XML control mesh into a cage (no id). Throws a user-facing error. */
export function readTSM(text) {
  const t = String(text || "");
  const d = /^\s*</.test(t) ? parseXML(t) : parseText(t);
  if (d.v.length < 3 || !d.f.length) throw new Error("No T-Spline control mesh (vertices and faces) was found in the file");
  const n = d.v.length;
  if (d.f.some((fc) => fc.some((i) => !(i >= 0 && i < n)))) throw new Error("The file refers to vertices that do not exist");
  if (d.f.length > 100000) throw new Error("The total number of faces cannot exceed 100,000");
  const c = tidy({ v: d.v, f: d.f, crease: d.crease.filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n), cv: d.cv.filter((i) => i >= 0 && i < n), frozen: (d.frozen || []).filter((i) => i >= 0 && i < n), iso: (d.iso || []).filter((i) => i >= 0 && i < n), sym: d.sym });
  return compact(orient(c)).cage;
}
