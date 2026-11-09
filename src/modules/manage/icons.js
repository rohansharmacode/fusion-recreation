// Original toolbar icons (32 px grid, no Autodesk artwork) for the MANAGE tab commands this module
// adds: Fusion Manage (PIM*) and Task Management. The other manage commands use icons/cmd-other.js.
import { registerIcons } from "../icons/icons.js";
import { C, ctx, rc, ln, pa, ci, tx } from "../icons/draw.js";

const page = () => rc(6, 3, 18, 25, C.paper, C.paperEdge, 1, { rx: 1 });
const lines = (n, x = 10, y = 10) => Array.from({ length: n }, (_, i) => ln(x, y + i * 4, 20, y + i * 4, C.inkLight, 1.2)).join("");
const check = (x, y, s = 1, col = C.green) => pa(`M${x} ${y}l${3 * s} ${3 * s} ${6 * s} ${-7 * s}`, null, col, 2);
const checklist = () => page() + [9, 15, 21].map((y) => rc(9, y - 2, 4, 4, C.white, C.ink, 1) + ln(15, y, 21, y, C.inkLight, 1.2)).join("") + pa("M9.6 13.2l1.4 1.4 2.6-3", null, C.green, 1.4);
const tag = () => pa("M4 6h11l12 12-9 9L6 15z", "#e9eef3", C.ink, 1.2) + ci(10, 11, 2, C.white, C.ink, 1);
const badge = (inner) => ci(24, 24, 7, C.blue, C.blueEdge, 1) + inner;
const plus = () => badge(ln(24, 20.5, 24, 27.5, C.white, 2) + ln(20.5, 24, 27.5, 24, C.white, 2));

const ICONS = {
  PIMAssignItemNumberCmd: () => tag() + (ctx.small ? "" : tx(16.5, 21, "#", 9, C.blue)),
  PIMQuickReleaseCmd: () => page() + lines(3) + badge(pa("M25 18.5l-4 6h3l-1 5 4-6.5h-3z", C.yellow, C.white, 0.8)),
  PIMECOReleaseCmd: () => page() + lines(3) + badge(check(20.5, 24, 0.8, C.white)),
  PIMGoToDashboardCmd: () => rc(4, 5, 24, 22, C.paper, C.paperEdge, 1, { rx: 1.5 }) + rc(7, 9, 8, 7, C.blueLight, C.blueEdge, 0.8) + rc(17, 9, 8, 7, "#c7e6b8", C.greenEdge, 0.8) + rc(7, 18, 18, 6, "#e9eef3", C.ink, 0.8) + ln(9, 21, 20, 21, C.inkLight, 1.2),
  PIMGoToItemDetailsCmd: () => page() + lines(4, 10, 9) + badge(ln(24, 23, 24, 27.5, C.white, 2) + ci(24, 20.3, 1.1, C.white)),
  PIMGoToChangeOrderCmd: () => page() + lines(2) + pa("M10 20h9l-2.5-2.5M20 24h-9l2.5 2.5", null, C.blue, 1.6),
  TaskManagementCreateTaskCmd: () => checklist() + plus(),
  TaskManagementRelatedTasksCmd: () => checklist() + badge(pa("M21.5 25.5l5-5M22.6 21.2l1.2-1.2a2 2 0 0 1 2.8 2.8l-1.2 1.2M25.4 26.8l-1.2 1.2a2 2 0 0 1-2.8-2.8l1.2-1.2", null, C.white, 1.3)),
  TaskManagementOpenTasksCmd: () => checklist() + badge(pa("M22 20h5v5M27 20l-6 6", null, C.white, 1.6)),
};

export function registerManageIcons() { registerIcons(ICONS); }
