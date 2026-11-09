// pcb: original icons for the PCB environment commands (the shared library draws the three Create PCB icons).
// Simple isometric boards with overlays; no Autodesk artwork.
import { registerIcons, registerFeatureIcons } from "../icons/icons.js";
import { S, box, badge, arrow, C, pa, ci, pl, dash, refresh } from "../icons/parts.js";

const board = (s, chip = true) => {
  s.add(box(-9, -7, 0, 9, 7, 1.3), "pcb");
  if (chip) s.add(box(-4, -3, 1.3, 2, 3, 3.2), "dark");
  return s;
};

export function registerPcbIcons() {
  registerIcons({
    PCBDefineBoardCmd: () => board(S(19), false).svg() + pa("M6 22l8-4.6 9 5.2-8 4.6z", null, C.sketch, 1.4, dash(2, 1.2)) + ci(6, 22, 1.8, C.pt, C.ptEdge, 0.8),
    PCBImprintCmd: () => board(S(15), false).svg() + pa("M5 26l9-5.2 11 6.3-9 5.2z", null, C.sketch, 1.3) + arrow([[16, 15], [16, 23]], { w: 1.8, hl: 3.6, hw: 4.6 }),
    PCBBoardSketchEditCmd: () => board(S(19), false).svg() + pa("M19 6l6 6-11 11h-6v-6z", "#ffd27a", C.sketchDark, 1) + pl([[17, 8], [23, 14]], C.sketchDark, 0.9),
    PCBMoveComponentsCmd: () => board(S(21)).svg() + arrow([[16, 9], [27, 3]], { w: 1.8, hl: 3.6, hw: 4.6 }) + arrow([[16, 9], [5, 3]], { w: 1.8, hl: 3.6, hw: 4.6, fill: C.green, stroke: C.greenEdge }),
    PCBFlipComponentCmd: () => board(S(17)).svg() + refresh(16, 16, 11, { stroke: C.blue }),
    PCBStatusCmd: () => board(S(19)).svg() + badge.check(25, 24),
    PCBStop: () => board(S(17)).svg() + badge.check(24, 24, 6.4),
  });
  registerFeatureIcons({ pcb: "PCBCreateCmd" });
}
