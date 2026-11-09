// Boot smoke test: the app loads, the kernel starts, and a box can be modelled through the App API.
//   node tests/e2e/boot.mjs [--only=viewport,...]
import { launch } from "./harness.mjs";

const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7) || undefined;
const h = await launch({ only, outDir: "build/e2e-boot", port: 5299, shots: "tests/e2e/out/boot" });
try {
  const info = await h.page.evaluate(() => {
    const f = app.addFeature({ type: "box", length: "40 mm", width: "20 mm", height: "10 mm", operation: "new", plane: { kind: "origin", name: "XY" } });
    const r = app.featureResult(f.id);
    const bodies = app.bodies();
    const vol = bodies.length ? app.K.R.measureVolume(bodies[0].shape) : 0;
    return { ok: r && r.ok, error: r && r.error, bodies: bodies.length, vol, features: app.doc.features.length, commands: app.commands.all().length };
  });
  console.log("boot:", JSON.stringify(info));
  await h.frames(5);
  console.log("screenshot:", await h.shot("boot"));
  if (h.errors.length) console.log("errors:\n" + h.errors.join("\n"));
  if (!info.ok || Math.abs(info.vol - 8000) > 1e-3) { console.error("FAIL"); process.exitCode = 1; } else console.log("PASS");
} finally {
  await h.close();
}
