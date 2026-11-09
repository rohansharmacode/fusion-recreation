// Geometric constraint commands: pick entities in sequence (or use the pre-selection), check the
// constraint can be solved, then add it as one undoable step.
import { ST, vp, activeData, mutateSketch, params, refKey } from "./ctx.js";
import { Tool, endTool } from "./tools.js";

const P2 = (sk, id) => [sk.points[id].x, sk.points[id].y];
const kindOf = (sk, r) => {
  if (!r) return null;
  if (r.kind === "sketchPoint") return "point";
  const cv = sk.curves[r.curve];
  if (!cv) return null;
  if (cv.type === "point") return "point";
  if (cv.type === "circle" || cv.type === "arc") return "round";
  if (cv.type === "spline") return "spline";
  if (cv.type === "ellipse" || cv.type === "earc") return "ellipse";
  return "line";
};
/** The point shared by an end of spline s and curve o (G1 tangency needs one), or null. */
const sharedEnd = (sk, s, o) => {
  const S = ST.app.S;
  const ends = S.curveEnds(sk.curves[s]);
  const op = S.curvePoints(sk.curves[o]);
  return ends.find((p) => op.includes(p)) || null;
};
const pid = (sk, r) => (r.kind === "sketchPoint" ? r.point : sk.curves[r.curve].p);
const cid = (r) => r.curve;
const has = (sk, type, refs) => sk.constraints.some((c) => c.type === type && c.refs.length === refs.length && c.refs.every((x, i) => x === refs[i] || (refs.length === 2 && c.refs[1 - i] === x)));
const NEED = { need: true };
const err = (m) => ({ error: m });
const ALREADY = "Constraint has already been applied to the selected sketch object.";

/** Constraint definitions: build(sk, picks) -> {cons:[{type, refs, ...}]} | NEED | {error} */
export const CONSTRAINTS = {
  ConstraintHorizontalVertical: {
    label: "Horizontal/Vertical",
    prompt: ["Select a line or two points", "Select the second point"],
    build(sk, p) {
      const k = p.map((r) => kindOf(sk, r));
      if (k[0] === "line") {
        const cv = sk.curves[cid(p[0])];
        const a = P2(sk, cv.p1), b = P2(sk, cv.p2);
        const type = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? "horizontal" : "vertical";
        if (has(sk, "horizontal", [cid(p[0])]) || has(sk, "vertical", [cid(p[0])])) return err(ALREADY);
        return { cons: [{ type, refs: [cid(p[0])] }] };
      }
      if (k[0] === "point") {
        if (p.length < 2) return NEED;
        if (k[1] !== "point") return err("Select a line or two points");
        const a = P2(sk, pid(sk, p[0])), b = P2(sk, pid(sk, p[1]));
        const type = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? "horizontal" : "vertical";
        return { cons: [{ type, refs: [pid(sk, p[0]), pid(sk, p[1])] }] };
      }
      return err("Select a line or two points");
    },
  },
  ConstraintCoincident: {
    label: "Coincident",
    prompt: ["Select a point", "Select a point or curve"],
    build(sk, p) {
      if (p.length < 2) return NEED;
      const k = p.map((r) => kindOf(sk, r));
      if (k[0] === "point" && k[1] === "point") {
        const a = pid(sk, p[0]), b = pid(sk, p[1]);
        if (a === b) return err(ALREADY);
        return { cons: [{ type: "coincident", refs: [a, b] }] };
      }
      const pi = k[0] === "point" ? 0 : k[1] === "point" ? 1 : -1;
      if (pi < 0) return err("Select a point and a point or curve");
      const curve = cid(p[1 - pi]);
      const pt = pid(sk, p[pi]);
      if (ST.app.S.curvePoints(sk.curves[curve]).includes(pt)) return err(ALREADY);
      return { cons: [{ type: "onCurve", refs: [pt, curve] }] };
    },
  },
  ConstraintTangent: {
    label: "Tangent",
    prompt: ["Select a curve", "Select a second curve"],
    build(sk, p) {
      if (p.length < 2) return NEED;
      const k = p.map((r) => kindOf(sk, r));
      if (k.includes("point")) return err("Select two curves");
      if (k[0] === "line" && k[1] === "line") return err("A tangent constraint needs a circle or an arc");
      if (k.includes("spline")) {
        // G1 at the point where the spline ends on the other curve; the other curve keeps its shape
        const si = k[1] === "spline" ? 1 : 0;
        const s = cid(p[si]), o = cid(p[1 - si]);
        if (s === o) return err("Select two curves");
        const at = sharedEnd(sk, s, o);
        if (!at || !ST.app.S.curveEnds(sk.curves[o]).includes(at)) return err("Select curves that meet at an end point of the spline");
        if (has(sk, "tangent", [o, s])) return err(ALREADY);
        return { cons: [{ type: "tangent", refs: [o, s] }] };
      }
      if (k.includes("ellipse")) {
        if (!k.includes("line")) return err("Select a line and an ellipse");
        const c = { type: "tangent", refs: [cid(p[0]), cid(p[1])] };
        if (has(sk, "tangent", c.refs)) return err(ALREADY);
        return { cons: [c] };
      }
      const c = { type: "tangent", refs: [cid(p[0]), cid(p[1])] };
      if (k[0] === "round" && k[1] === "round") {
        const A = sk.curves[cid(p[0])], B = sk.curves[cid(p[1])];
        const d = Math.hypot(sk.points[A.c].x - sk.points[B.c].x, sk.points[A.c].y - sk.points[B.c].y);
        if (d < Math.abs(Math.abs(A.r) - Math.abs(B.r)) + 1e-9 || d < Math.max(Math.abs(A.r), Math.abs(B.r))) c.mode = "int";
      }
      if (has(sk, "tangent", c.refs)) return err(ALREADY);
      return { cons: [c] };
    },
  },
  ConstraintEqual: {
    label: "Equal",
    prompt: ["Select a line, arc or circle", "Select a second curve of the same type"],
    build(sk, p) {
      if (p.length < 2) return NEED;
      const k = p.map((r) => kindOf(sk, r));
      if (k[0] !== k[1] || k[0] === "point" || k[0] === "spline" || k[0] === "ellipse") return err("Select two lines or two arcs/circles");
      if (has(sk, "equal", [cid(p[0]), cid(p[1])])) return err(ALREADY);
      return { cons: [{ type: "equal", refs: [cid(p[0]), cid(p[1])] }] };
    },
  },
  ConstraintParallel: lineLine("parallel", "Parallel"),
  ConstraintPerpendicular: lineLine("perpendicular", "Perpendicular"),
  ConstraintCollinear: lineLine("collinear", "Collinear"),
  ConstraintMidPoint: {
    label: "Midpoint",
    prompt: ["Select a point or a line", "Select a line or a point"],
    build(sk, p) {
      if (p.length < 2) return NEED;
      const k = p.map((r) => kindOf(sk, r));
      const li = k[0] === "line" ? 0 : k[1] === "line" ? 1 : -1;
      if (li < 0 || k[1 - li] !== "point") return err("Select a point and a line");
      return { cons: [{ type: "midpoint", refs: [pid(sk, p[1 - li]), cid(p[li])] }] };
    },
  },
  ConstraintConcentric: {
    label: "Concentric",
    prompt: ["Select an arc or circle", "Select a second arc or circle"],
    build(sk, p) {
      if (p.length < 2) return NEED;
      const k = p.map((r) => kindOf(sk, r));
      if (!["round", "ellipse"].includes(k[0]) || !["round", "ellipse"].includes(k[1])) return err("Select two arcs, circles or ellipses");
      if (sk.curves[cid(p[0])].c === sk.curves[cid(p[1])].c) return err(ALREADY);
      return { cons: [{ type: "concentric", refs: [cid(p[0]), cid(p[1])] }] };
    },
  },
  ConstraintSymmetry: {
    label: "Symmetry",
    prompt: ["Select the first entity", "Select the second entity", "Select the symmetry line"],
    build(sk, p) {
      if (p.length < 3) {
        if (p.length === 2 && kindOf(sk, p[0]) !== kindOf(sk, p[1])) return err("Select two entities of the same type");
        return NEED;
      }
      const k = p.map((r) => kindOf(sk, r));
      if (k[2] !== "line") return err("The symmetry line must be a line");
      const L = cid(p[2]);
      if (k[0] === "point" && k[1] === "point") return { cons: [{ type: "symmetric", refs: [pid(sk, p[0]), pid(sk, p[1]), L] }] };
      if (k[0] === "round" && k[1] === "round") {
        const A = sk.curves[cid(p[0])], B = sk.curves[cid(p[1])];
        return { cons: [{ type: "symmetric", refs: [A.c, B.c, L] }, { type: "equal", refs: [cid(p[0]), cid(p[1])] }] };
      }
      if (k[0] === "line" && k[1] === "line") {
        const A = sk.curves[cid(p[0])], B = sk.curves[cid(p[1])];
        const l = sk.curves[L];
        const a = P2(sk, l.p1), b = P2(sk, l.p2);
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
        const refl = (q) => { const t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2; return [2 * (a[0] + t * dx) - q[0], 2 * (a[1] + t * dy) - q[1]]; };
        const d = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]);
        const r1 = refl(P2(sk, A.p1));
        const straight = d(r1, P2(sk, B.p1)) <= d(r1, P2(sk, B.p2));
        return { cons: [{ type: "symmetric", refs: [A.p1, straight ? B.p1 : B.p2, L] }, { type: "symmetric", refs: [A.p2, straight ? B.p2 : B.p1, L] }] };
      }
      return err("Select two points, lines or circles and a symmetry line");
    },
  },
};

function lineLine(type, label) {
  return {
    label,
    prompt: ["Select a line", "Select a second line"],
    build(sk, p) {
      if (p.length < 2) return NEED;
      const k = p.map((r) => kindOf(sk, r));
      if (k[0] !== "line" || k[1] !== "line") return err("Select two lines");
      if (cid(p[0]) === cid(p[1])) return err("Select two different lines");
      if (has(sk, type, [cid(p[0]), cid(p[1])])) return err(ALREADY);
      return { cons: [{ type, refs: [cid(p[0]), cid(p[1])] }] };
    },
  };
}

/** Try to add constraints (with solve check). Returns true on success. */
export function applyConstraints(label, cons) {
  const A = ST.app;
  const S = A.S;
  const d = activeData();
  if (!d) return false;
  const test = cons.map((c, i) => ({ id: `__t${i}`, ...c }));
  let res;
  try { res = S.tryConstraints(d.sk, params(), test); } catch (e) { console.error(e); res = { ok: false, reason: "conflict" }; }
  if (!res.ok) {
    A.toast(res.reason === "redundant" ? "The constraint is redundant: the geometry is already constrained this way." : "Unable to apply the constraint: it conflicts with existing constraints or dimensions.", "warning", 3200);
    return false;
  }
  mutateSketch(label, (sk) => { for (const c of cons) { const { type, refs, ...rest } = c; S.addConstraint(sk, type, refs, rest); } });
  return true;
}

export class ConstraintTool extends Tool {
  constructor(id, def) { super(id, def.label); this.def = def; this.picks = []; }
  prompt() { const p = this.def.prompt || []; return p[Math.min(this.picks.length, p.length - 1)] || ""; }
  filter(r) { return !!r && r.sketch === ST.sketchId && (r.kind === "sketchPoint" || r.kind === "sketchCurve"); }
  reset() { this.picks = []; ST.app.selection.clear(); this.refreshPrompt(); }
  move(ctx) {
    const h = vp().pick(ctx.x, ctx.y, { filter: (r) => this.filter(r) });
    ST.app.selection.setHover(h ? h.ref : null);
  }
  click(ctx) {
    const h = vp().pick(ctx.x, ctx.y, { filter: (r) => this.filter(r) });
    if (!h) return;
    if (this.picks.some((p) => refKey(p) === refKey(h.ref))) return;
    this.picks.push(h.ref);
    ST.app.selection.set(this.picks);
    this.evaluate();
  }
  evaluate() {
    const d = activeData();
    if (!d) return;
    const r = this.def.build(d.sk, this.picks);
    if (r.need) { this.refreshPrompt(); return; }
    if (r.error) { ST.app.toast(r.error, "warning", 2400); this.picks.pop(); ST.app.selection.set(this.picks); this.refreshPrompt(); return; }
    applyConstraints(this.label, r.cons);
    this.picks = [];
    ST.app.selection.clear();
    this.refreshPrompt();
  }
}

/** Run a constraint command: uses the pre-selection when it is complete, else starts picking. */
export function runConstraint(id) {
  const A = ST.app;
  const def = CONSTRAINTS[id];
  if (!def) return;
  const d = activeData();
  if (!d) return;
  const pre = A.selection.items.filter((r) => (r.kind === "sketchPoint" || r.kind === "sketchCurve") && r.sketch === ST.sketchId);
  if (pre.length) {
    const r = def.build(d.sk, pre);
    if (r.cons) { applyConstraints(def.label, r.cons); A.selection.clear(); return; }
    if (r.error) { A.toast(r.error, "warning", 2400); A.selection.clear(); }
  }
  const t = new ConstraintTool(id, def);
  t.start();
  if (pre.length) {
    const r = def.build(d.sk, pre);
    if (r.need) { t.picks = pre.slice(); A.selection.set(t.picks); t.refreshPrompt(); }
  }
}

/** Fix/UnFix: toggles the fix constraint on picked / selected entities. */
export function toggleFix(refs) {
  const A = ST.app;
  const d = activeData();
  if (!d || !refs.length) return;
  const ids = refs.map((r) => (r.kind === "sketchPoint" ? r.point : r.curve)).filter((x) => x && x !== "o");
  if (!ids.length) return;
  const fixedNow = ids.every((id) => d.sk.constraints.some((c) => c.type === "fix" && c.refs.includes(id)));
  mutateSketch(fixedNow ? "UnFix" : "Fix", (sk) => {
    if (fixedNow) sk.constraints = sk.constraints.filter((c) => !(c.type === "fix" && c.refs.some((r) => ids.includes(r))));
    else for (const id of ids) if (!sk.constraints.some((c) => c.type === "fix" && c.refs.includes(id))) A.S.addConstraint(sk, "fix", [id]);
  });
}

export class FixTool extends Tool {
  constructor() { super("ConstraintFix", "Fix/UnFix"); }
  prompt() { return "Select geometry to fix or unfix"; }
  move(ctx) {
    const h = vp().pick(ctx.x, ctx.y, { filter: (r) => !!r && r.sketch === ST.sketchId && (r.kind === "sketchPoint" || r.kind === "sketchCurve") });
    ST.app.selection.setHover(h ? h.ref : null);
  }
  click(ctx) {
    const h = vp().pick(ctx.x, ctx.y, { filter: (r) => !!r && r.sketch === ST.sketchId && (r.kind === "sketchPoint" || r.kind === "sketchCurve") });
    if (h) toggleFix([h.ref]);
  }
}

export function runFix() {
  const A = ST.app;
  const pre = A.selection.items.filter((r) => (r.kind === "sketchPoint" || r.kind === "sketchCurve") && r.sketch === ST.sketchId);
  if (pre.length) { toggleFix(pre); return; }
  new FixTool().start();
}

export { endTool };
