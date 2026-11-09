// In-browser check of the engine work: parametric robustness through the real App (preview /
// updateFeature / undo) and wasm memory while a dialog streams live previews (manipulator drag).
//   node tests/engine_browser.mjs [--no-build] [--n=300]
// Uses build/engine on port 5337, screenshots in tests/e2e/out/engine.
import { launch } from "./e2e/harness.mjs";

const args = process.argv.slice(2);
const N = Number((args.find((a) => a.startsWith("--n=")) || "--n=300").slice(4));
const h = await launch({ outDir: "build/engine", port: 5337, shots: "tests/e2e/out/engine", width: 1389, height: 795, build: !args.includes("--no-build") });
let failed = 0;
const check = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && info !== undefined ? "  " + JSON.stringify(info) : ""}`); if (!ok) failed++; };
const ev = (fn, arg) => h.page.evaluate(fn, arg);
try {
  // ---- model: rect 40 x 20 -> extrude 10 -> fillet top front edge r2 -> hole on the top face
  const ids = await ev(() => {
    const a = window.app;
    const sk = a.S.newSketch();
    a.S.addRect2pt(sk, [0, 0], [40, 20]);
    const s = a.addFeature({ type: "sketch", plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, planeRef: { kind: "origin", name: "XY" }, sk, visible: true });
    const reg = a.sketchState(s.id).regions.regions[0];
    const e = a.addFeature({ type: "extrude", profiles: [{ sketch: s.id, key: reg.key, c: [20, 10] }], distance: "10 mm", operation: "new" });
    const body = e.newBody;
    const f = a.addFeature({ type: "fillet", edges: [{ body, p: [20, 0, 10] }], radius: "2 mm", tangentChain: true });
    const hl = a.addFeature({ type: "hole", placement: "face", points: [[24, 11, 10]], normal: [0, 0, 1], faceRef: { body, p: [24, 11, 10], n: [0, 0, 1] }, diameter: "5 mm", depth: "10 mm", drillPoint: "angle", tipAngle: "118 deg", holeType: "simple", extent: "distance", operation: "cut" });
    return { s: s.id, e: e.id, f: f.id, h: hl.id, body };
  });
  const state = () => ev((ids) => {
    const a = window.app;
    const b = a.body(ids.body);
    const R = a.K.R;
    const inside = (p) => { const v = R.makeVertex(p); try { return a.K.shapeDistance(b.shape, v) < 1e-7; } finally { v.delete(); } };
    return {
      ok: Object.fromEntries(a.doc.features.map((f) => [f.type, !!(a.featureResult(f.id) && a.featureResult(f.id).ok)])),
      vol: b ? R.measureVolume(b.shape) : null,
      holeZ: a.feature(ids.h).points[0][2],
      holeOpen: b ? !inside([24, 11, a.feature(ids.h).points[0][2] - 0.1]) : null,
    };
  }, ids);
  let s = await state();
  check("browser: sketch / extrude / fillet / hole compute", Object.values(s.ok).every(Boolean), s);
  await ev(() => window.app.viewport.setView("home", { animate: false }));
  await h.frames(3);

  // ---- edit the extrude like the timeline dialog: live previews, then OK
  const mem = () => ev(() => { const oc = window.app.K.R.getOC(); const p = oc.___libc_malloc(1 << 20); oc.___libc_free(p); return { top: p, wasm: oc.wasmMemory.buffer.byteLength }; });
  const drag = async (label, mk) => {
    const samples = [];
    const t0 = Date.now();
    const m0 = await mem();
    for (let i = 0; i < N; i++) {
      await ev(mk, i);
      if (i % 25 === 24) { await h.frames(2); samples.push((await mem()).top); } else await h.frames(1);
    }
    const q = Math.max(2, Math.floor(samples.length / 4));
    const grow = Math.min(...samples.slice(-q)) - Math.min(...samples.slice(0, q));
    const m1 = await mem();
    const per = grow / ((samples.length - q) * 25) / 1024;
    console.log(`      ${label}: ${N} previews in ${((Date.now() - t0) / N).toFixed(1)} ms each, heap top ${(grow / 1048576).toFixed(1)} MB (${per.toFixed(1)} KB/preview), wasm memory ${(m0.wasm / 1048576).toFixed(0)} -> ${(m1.wasm / 1048576).toFixed(0)} MB`);
    return per;
  };
  const perE = await drag("extrude distance drag (edit Extrude1)", (i) => {
    const a = window.app;
    const f = JSON.parse(JSON.stringify(a.doc.features.find((x) => x.type === "extrude")));
    f.distance = `${10 + (i % 50) / 5} mm`;
    a.preview(f, { replaceId: f.id });
  });
  check("browser: extrude drag previews keep the wasm heap flat (< 15 KB/preview)", perE < 15, perE);
  await ev((id) => { const a = window.app; a.endPreview(); a.updateFeature(id, { distance: "15 mm" }, "Edit Extrude"); }, ids.e);
  s = await state();
  check("browser: after Extrude 10 -> 15 every feature computes (fillet edge re-found)", Object.values(s.ok).every(Boolean), s);
  check("browser: the hole moved up with the top face and is open there", s.holeZ === 15 && s.holeOpen === true, s);
  check("browser: volume = 40*20*15 - fillet - hole", Math.abs(s.vol - (12000 - (1 - Math.PI / 4) * 4 * 40 - (Math.PI * 6.25 * 10 + (Math.PI * 6.25 * (2.5 / Math.tan((59 * Math.PI) / 180))) / 3))) < 0.05, s.vol);
  await h.shot("engine-after-edit");
  await ev(() => window.app.history.undo());
  s = await state();
  check("browser: undo restores 10 mm with fillet + hole at z = 10", Object.values(s.ok).every(Boolean) && s.holeZ === 10, s);
  await ev(() => window.app.history.redo());
  s = await state();
  check("browser: redo back to 15 mm", Object.values(s.ok).every(Boolean) && s.holeZ === 15, s);

  // ---- a new fillet whose radius is dragged (previews of a feature at the end of the timeline)
  const perF = await drag("fillet radius drag (new Fillet)", (i) => {
    const a = window.app;
    const body = Object.keys(a.doc.bodies)[0];
    a.preview({ type: "fillet", edges: [{ body, p: [40, 10, 15] }], radius: `${0.5 + (i % 30) / 10} mm`, tangentChain: true });
  });
  check("browser: fillet drag previews keep the wasm heap flat (< 15 KB/preview)", perF < 15, perF);
  await ev(() => window.app.endPreview());
  check("browser: no page errors", h.errors.length === 0, h.errors.slice(0, 3));
} finally {
  await h.close();
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exitCode = failed ? 1 : 0;
