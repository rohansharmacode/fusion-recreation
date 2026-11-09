// sheetmetal: original icons for the commands and timeline types that the shared library does not draw.
// (No Autodesk artwork: simple isometric plates and bend lines.)
import { registerIcons } from "../icons/icons.js";
import { pg, pa, ln, C, badge, dash } from "../icons/draw.js";

// isometric plate: corners of the top face, thickness drop
const plate = (x0, y0, w, d, t = 2.2, fill = "#c9d3dc", side = "#8f9caa") => {
  const P = (u, v) => [x0 + u * 0.87 - v * 0.87, y0 + u * 0.5 + v * 0.5];
  const a = P(0, 0), b = P(w, 0), c = P(w, d), e = P(0, d);
  return pg([e, c, [c[0], c[1] + t], [e[0], e[1] + t]], side, C.edge, 0.8) + pg([c, b, [b[0], b[1] + t], [c[0], c[1] + t]], "#a9b5c1", C.edge, 0.8) + pg([a, b, c, e], fill, C.edge, 0.9);
};

export function registerSheetMetalIcons() {
  registerIcons({
    SMBaseFlange: () => plate(16, 7, 13, 11, 2.4, "#a9d4f8", "#5f8fbf"),
    ExportFlatPatternCmd: () => plate(14, 8, 12, 10) + pa("M7.2 15.7l12.4 7.1", null, C.blue, 1.1, dash(1.8, 1.2)) + pa("M21 4h7v7M28 4l-7.5 7.5", null, C.green, 1.8),
    FusionSheetMetalExitFlatPatternCmd: () => plate(14, 6, 12, 10) + badge.check(23, 23, 6),
    FusionSheetMetalCosmeticBendCmd: () => plate(16, 7, 13, 11) + ln(10.4, 13.9, 21.7, 20.4, C.red, 1.3, dash(2, 1.2)),
  });
}
