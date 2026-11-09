// Keyboard Shortcuts dialog and About dialog.
import * as THREE from "three";
import { el, esc, iconHtml } from "./util.js";

const NAV = [
  ["Pan", "Middle mouse drag"],
  ["Orbit", "Shift + middle mouse drag"],
  ["Zoom", "Mouse wheel"],
  ["Fit", "Double-click middle mouse"],
  ["Marking menu", "Right-click (or right-drag toward an item)"],
  ["Toolbox", "S"],
  ["Cancel command / clear selection", "Esc"],
  ["Delete selection", "Delete"],
];

function keysHtml(sc) {
  const list = Array.isArray(sc) ? sc : [sc];
  return list.filter(Boolean).map((s) => s.split("+").map((k) => `<kbd>${esc(k === "Delete" ? "Del" : k)}</kbd>`).join("<span class='ks-plus'>+</span>")).join("<span class='ks-or'>or</span>");
}

export function createInfo(app, modals) {
  function shortcutsDialog() {
    const search = el("input", { type: "search", class: "mn-input ks-search", placeholder: "Search", "data-input": "search", "data-no-submit": "" });
    const show = el("select", { class: "mn-select ks-show", "data-input": "show" },
      el("option", { value: "assigned", text: "Show: Assigned shortcuts" }),
      el("option", { value: "all", text: "Show: All commands" }));
    const list = el("div", { class: "ks-list" });
    const render = () => {
      const q = search.value.trim().toLowerCase();
      const all = app.commands.all().filter((d) => !d.alias && !d.hidden && (show.value === "all" || d.shortcut));
      const groups = { "": [], model: [], sketch: [] };
      for (const d of all) {
        const label = d.label || d.id;
        if (q && !`${label} ${d.id} ${[].concat(d.shortcut || []).join(" ")}`.toLowerCase().includes(q)) continue;
        const g = d.when === "sketch" ? "sketch" : d.when === "model" || d.kind === "feature" || d.kind === "tool" ? "model" : "";
        groups[g].push(d);
      }
      list.innerHTML = "";
      const sec = (title, items) => {
        if (!items.length) return;
        items.sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)));
        list.appendChild(el("div", { class: "ks-section", text: title }));
        for (const d of items) {
          const row = el("div", { class: `ks-row${d.stub ? " ks-stub" : ""}`, dataset: { ksCmd: d.id } });
          row.innerHTML = `<span class="ks-ico">${iconHtml(d.id, 16)}</span><span class="ks-label">${esc(d.label || d.id)}${d.stub ? ' <span class="mn-dim">(not available)</span>' : ""}</span><span class="ks-keys">${d.shortcut ? keysHtml(d.shortcut) : '<span class="mn-dim">-</span>'}</span>`;
          list.appendChild(row);
        }
      };
      sec("General", groups[""]);
      sec("Design", groups.model);
      sec("Sketch", groups.sketch);
      const nav = NAV.filter(([a, b]) => !q || `${a} ${b}`.toLowerCase().includes(q));
      if (nav.length) {
        list.appendChild(el("div", { class: "ks-section", text: "Mouse and navigation" }));
        for (const [a, b] of nav) list.appendChild(el("div", { class: "ks-row", html: `<span class="ks-ico"></span><span class="ks-label">${esc(a)}</span><span class="ks-keys ks-text">${esc(b)}</span>` }));
      }
      if (!list.children.length) list.appendChild(el("div", { class: "mn-open-empty", text: "No commands match your search" }));
    };
    search.addEventListener("input", render);
    show.addEventListener("change", render);
    modals.open({
      id: "KeyboardShortcuts",
      title: "Keyboard Shortcuts",
      width: 560,
      height: Math.min(620, window.innerHeight - 60),
      className: "ks-dialog",
      body: el("div", { class: "ks-body" }, el("div", { class: "ks-toolbar" }, search, show), list),
      enterSubmits: false,
      focus: ".ks-search",
      buttons: [{ action: "ok", label: "Close", primary: true }],
    });
    render();
  }

  function aboutDialog() {
    let built = "";
    try { built = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : ""; } catch { built = ""; }
    const builtText = built ? new Date(built).toLocaleString() : "development build";
    const body = el("div", { class: "ab-body" },
      el("div", { class: "ab-mark", html: '<svg width="56" height="56" viewBox="0 0 56 56"><path d="M28 8 L46 18 L46 38 L28 48 L10 38 L10 18 Z" fill="#eef4f9" stroke="#5b7fa6" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 18 L28 28 L46 18 M28 28 L28 48" fill="none" stroke="#5b7fa6" stroke-width="1.6" stroke-linejoin="round"/><path d="M28 28 L46 18 L46 38 L28 48 Z" fill="#c9d9e8"/><path d="M10 18 L28 28 L28 48 L10 38 Z" fill="#dde8f2"/></svg>' }),
      el("div", { class: "ab-text" },
        el("div", { class: "ab-title", text: "Fusion Design: unofficial recreation" }),
        el("div", { class: "ab-disclaimer", text: "Unofficial hackathon recreation: not affiliated with or endorsed by Autodesk" }),
        el("div", { class: "ab-p", html: "A browser recreation of a parametric CAD Design workspace: sketches with a constraint solver, a parametric timeline, B-rep solid modelling, the ViewCube, the marking menu and the S toolbox." }),
        el("table", { class: "ab-table" },
          el("tr", {}, el("td", { text: "Version" }), el("td", { text: "1.0.0" })),
          el("tr", {}, el("td", { text: "Build" }), el("td", { text: builtText })),
          el("tr", {}, el("td", { text: "Rendering" }), el("td", { text: `three.js r${THREE.REVISION}` })),
          el("tr", {}, el("td", { text: "Geometry kernel" }), el("td", { text: "OpenCascade (WebAssembly) via replicad" })),
          el("tr", {}, el("td", { text: "Commands" }), el("td", { text: String(app.commands.all().filter((d) => !d.stub && !d.alias).length) }))),
        el("div", { class: "ab-small", text: "Autodesk and Fusion are registered trademarks of Autodesk, Inc. No Autodesk logos, icons or files are used; all artwork is original." })));
    modals.open({
      id: "About",
      title: "About",
      width: 520,
      className: "ab-dialog",
      body,
      buttons: [{ action: "ok", label: "OK", primary: true }],
    });
  }

  return { shortcutsDialog, aboutDialog };
}
