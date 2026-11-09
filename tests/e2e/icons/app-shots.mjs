// Screenshots of the icon set inside the real app (toolbar, dropdowns, browser, timeline).
import { launch } from "../harness.mjs";
const only = process.argv[2] || "viewport,sketch,dialogs,inspect,shell,browser,timeline,menus";
const h = await launch({ only, outDir: "build/icons", port: 5313, shots: "tests/e2e/out/icons" });
try {
  await h.frames(5);
  await h.shot("app-solid");
  await h.page.screenshot({ path: "tests/e2e/out/icons/app-toolbar.png", clip: { x: 0, y: 0, width: 1600, height: 130 } });
  // open the CREATE dropdown
  const p = await h.page.$('[data-panel="SolidCreatePanel"]');
  if (p) { await p.click(); await h.frames(3); await h.shot("app-create-menu"); await h.page.keyboard.press("Escape"); }
  const m = await h.page.$('[data-panel="SolidModifyPanel"]');
  if (m) { await m.click(); await h.frames(3); await h.shot("app-modify-menu"); await h.page.keyboard.press("Escape"); }
  // sketch mode
  await h.page.evaluate(async () => {
    const app = window.app;
    if (app.commands.has("SketchCreate")) app.commands.run("SketchCreate");
  });
  await h.frames(10);
  await h.shot("app-sketch-pick");
  console.log("errors:", h.errors.slice(0, 10));
} finally { await h.close(); }
