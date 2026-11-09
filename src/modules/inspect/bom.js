// BILL OF MATERIALS (MaterializedBomHybridCmd, the last MODIFY button): a window listing the
// design's bodies (every body of the root component, shown or hidden) with Item, Part Name,
// Quantity, Material, Mass and Volume, a totals row, and Export to CSV (app.download).
// Mass = volume x physical-material density (doc units: mm, g), the same numbers as Properties.
import { volumeProps, fmtNum } from "./geom.js";
import { materialOf } from "./library.js";
import { esc } from "./ui.js";

const COLS = [
  { key: "item", label: "Item", cls: "num" },
  { key: "name", label: "Part Name" },
  { key: "qty", label: "Quantity", cls: "num" },
  { key: "material", label: "Material" },
  { key: "mass", label: "Mass", cls: "num", unit: "g" },
  { key: "volume", label: "Volume", cls: "num", unit: "mm^3" },
];

/** BOM rows + totals: {rows:[{item, id, name, qty, material, mass, volume}], total:{qty, mass, volume}}. */
export function bomData(app) {
  const rows = [];
  const total = { qty: 0, mass: 0, volume: 0 };
  for (const b of app.bodies()) {
    if (!b.shape) continue;
    const meta = app.bodyMeta(b.id) || {};
    const mat = materialOf(meta);
    let volume = NaN;
    try { volume = volumeProps(app, b.shape).volume; } catch (e) { console.warn("[bom] volume failed", e); }
    const mass = Number.isFinite(volume) ? volume * (mat.density / 1000) : NaN;
    rows.push({ item: rows.length + 1, id: b.id, name: meta.name || b.id, qty: 1, material: mat.name, mass, volume, visible: meta.visible !== false });
    total.qty += 1;
    if (Number.isFinite(mass)) total.mass += mass;
    if (Number.isFinite(volume)) total.volume += volume;
  }
  return { rows, total };
}

const csvCell = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** CSV text of the BOM (header, one line per body, totals). */
export function bomCSV(app, data = bomData(app), prec = 3) {
  const head = COLS.map((c) => (c.unit ? `${c.label} (${c.unit})` : c.label));
  const lines = [head.map(csvCell).join(",")];
  for (const r of data.rows) lines.push([r.item, r.name, r.qty, r.material, fmtNum(r.mass, prec), fmtNum(r.volume, prec)].map(csvCell).join(","));
  lines.push(["", "Total", data.total.qty, "", fmtNum(data.total.mass, prec), fmtNum(data.total.volume, prec)].map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

export function openBOM(app) {
  const modals = app.ui.modals;
  if (app.mode === "sketch") {
    const stop = app.commands.get("SketchStop");
    if (stop && !stop.stub) app.commands.run("SketchStop"); else app.setMode("model");
  }
  try { if (app.activeCommand) app.activeCommand.cancel(); } catch { /* ignore */ }
  let data = bomData(app);
  const fileName = () => `${String(app.doc.name || "Untitled").replace(/[\\/:*?"<>|]+/g, "_")} BOM.csv`;
  const body = document.createElement("div");
  body.className = "insp-bom";
  const render = () => {
    data = bomData(app);
    const head = `<tr>${COLS.map((c) => `<th class="${c.cls || ""}" data-col="${c.key}">${esc(c.label)}${c.unit ? ` <span class="insp-bom-unit">(${esc(c.unit)})</span>` : ""}</th>`).join("")}</tr>`;
    const rows = data.rows.map((r) => `<tr data-body="${esc(r.id)}"${r.visible ? "" : ' class="hidden-body"'}>`
      + `<td class="num">${r.item}</td><td class="name">${esc(r.name)}</td><td class="num">${r.qty}</td><td>${esc(r.material)}</td>`
      + `<td class="num" data-col="mass">${esc(fmtNum(r.mass, 3))}</td><td class="num" data-col="volume">${esc(fmtNum(r.volume, 3))}</td></tr>`).join("");
    const empty = data.rows.length ? "" : `<tr class="insp-bom-empty"><td colspan="${COLS.length}">The design has no bodies yet.</td></tr>`;
    const tot = `<tr class="insp-bom-total"><td></td><td>Total</td><td class="num" data-col="qty">${data.total.qty}</td><td></td>`
      + `<td class="num" data-col="mass">${esc(fmtNum(data.total.mass, 3))}</td><td class="num" data-col="volume">${esc(fmtNum(data.total.volume, 3))}</td></tr>`;
    body.innerHTML = `<div class="insp-bom-bar"><span class="insp-bom-title">${esc(app.doc.name || "Untitled")}</span><span class="insp-bom-count">${data.rows.length} item${data.rows.length === 1 ? "" : "s"}</span></div>`
      + `<div class="insp-bom-scroll"><table class="insp-bom-table"><thead>${head}</thead><tbody>${rows}${empty}</tbody><tfoot>${tot}</tfoot></table></div>`;
  };
  render();
  const exportCSV = () => { app.download(fileName(), bomCSV(app, data), "text/csv"); app.toast(`Exported ${fileName()}`, "info", 1800); return false; };
  // rows select their body in the canvas (like Fusion's BOM)
  body.addEventListener("click", (ev) => {
    const tr = ev.target.closest && ev.target.closest("tr[data-body]");
    if (!tr) return;
    for (const x of body.querySelectorAll("tr.sel")) x.classList.remove("sel");
    tr.classList.add("sel");
    try { app.selection.set([{ kind: "body", body: tr.dataset.body }]); } catch { /* ignore */ }
  });
  if (!modals || typeof modals.open !== "function") {
    app.toast(`Bill of Materials: ${data.rows.length} bodies, ${fmtNum(data.total.mass, 3)} g`, "info", 4000);
    return null;
  }
  const off = app.on("model", (d) => { if (!d || !d.preview) render(); });
  const h = modals.open({
    id: "MaterializedBomHybridCmd",
    title: "Bill of Materials",
    className: "insp-bom-modal",
    width: 760,
    body,
    buttons: [
      { action: "export", label: "Export to CSV", onClick: exportCSV },
      { action: "ok", label: "Close", primary: true },
    ],
    onClose: () => off(),
  });
  return h;
}
