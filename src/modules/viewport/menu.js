// Small Fusion-style dropdown menu used by the navigation bar and the ViewCube.
// Items: {label, cmd?, onClick?, checked?: bool|fn, radio?, check?, items?: [...], sep?, header?,
//         icon?: html, indent?, shortcut?, disabled?}
// Items with `cmd` carry data-cmd and run app.commands.run(cmd); check/radio state comes from
// the command's checked(app) unless `checked` is given. Look per the reference captures: white,
// thin grey border, 24px rows, dark separators, a bold ring for the current radio item.
const ARROW = `<svg viewBox="0 0 8 8" width="8" height="8"><path d="M2.2 0.8 6.2 4 2.2 7.2z" fill="currentColor"/></svg>`;
const CHECK = `<svg viewBox="0 0 12 12" width="12" height="12"><path d="M2.2 6.3 4.9 9 9.9 3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const RING = `<svg viewBox="0 0 12 12" width="12" height="12"><circle cx="6" cy="6" r="3.9" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>`;
const BOX_ON = `<svg viewBox="0 0 14 14" width="13" height="13"><rect x="1.5" y="1.5" width="11" height="11" rx="1" fill="#3c3c3c" stroke="#3c3c3c"/><path d="M3.8 7.2 6 9.3 10.3 4.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const BOX_OFF = `<svg viewBox="0 0 14 14" width="13" height="13"><rect x="1.5" y="1.5" width="11" height="11" rx="1" fill="#fff" stroke="#8d8d8d"/></svg>`;

export class Menu {
  constructor(app) {
    this.app = app;
    this.stack = []; // open menu elements (root first)
    this.owner = null;
    this._onDoc = (ev) => {
      if (!this.stack.length) return;
      if (this.stack.some((m) => m.contains(ev.target))) return;
      if (this.owner && this.owner.contains(ev.target)) return;
      this.close();
    };
    this._onKey = (ev) => { if (ev.key === "Escape" && this.stack.length) { ev.stopPropagation(); ev.preventDefault(); this.close(); } };
    document.addEventListener("pointerdown", this._onDoc, true);
    window.addEventListener("keydown", this._onKey, true);
    window.addEventListener("blur", () => this.close());
  }

  get isOpen() { return this.stack.length > 0; }

  /** Open a root menu at (x, y) (client px). opts.alignRight: x is the right edge; opts.above: y is the bottom edge. */
  open(items, opts = {}) {
    const wasOwner = this.owner;
    this.close();
    if (opts.toggle && wasOwner && wasOwner === opts.owner) return null;
    this.owner = opts.owner || null;
    if (this.owner) this.owner.classList.add("vp-menu-owner-open");
    const el = this._build(items, 0, opts.cls);
    this._place(el, opts.x || 0, opts.y || 0, opts);
    return el;
  }

  close(level = 0) {
    while (this.stack.length > level) {
      const m = this.stack.pop();
      m.remove();
    }
    if (level === 0 && this.owner) {
      this.owner.classList.remove("vp-menu-owner-open");
      this.owner = null;
    }
  }

  _checked(it) {
    if (typeof it.checked === "function") return !!it.checked(this.app);
    if (it.checked != null) return !!it.checked;
    if (it.cmd) {
      const d = this.app.commands.get(it.cmd);
      if (d && d.checked) { try { return !!d.checked(this.app); } catch { return false; } }
    }
    return false;
  }

  _mark(it, checked) {
    if (it.icon) return it.icon;
    if (it.check) return checked ? BOX_ON : BOX_OFF;
    if (it.radio) return checked ? RING : "";
    return checked ? CHECK : "";
  }

  _build(items, level, cls) {
    const app = this.app;
    const el = document.createElement("div");
    el.className = `vp-menu${cls ? ` ${cls}` : ""}`;
    el.dataset.level = String(level);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    for (const it of items) {
      if (!it) continue;
      if (it.sep) {
        const s = document.createElement("div");
        s.className = "vp-menu-sep";
        el.appendChild(s);
        continue;
      }
      if (it.header) {
        const h = document.createElement("div");
        h.className = "vp-menu-header";
        h.textContent = it.header;
        el.appendChild(h);
        continue;
      }
      const row = document.createElement("div");
      row.className = "vp-menu-item";
      if (it.indent) row.classList.add("indent");
      if (it.cmd) row.dataset.cmd = it.cmd;
      if (it.id) row.dataset.item = it.id;
      const disabled = it.disabled || (it.cmd && app.commands.has(it.cmd) && !app.commands.isEnabled(it.cmd));
      if (disabled) row.classList.add("disabled");
      const checked = this._checked(it);
      if (checked) row.classList.add("checked");
      const label = it.label || (it.cmd && app.commands.get(it.cmd)?.label) || it.cmd || "";
      row.innerHTML = `<span class="vp-menu-mark">${this._mark(it, checked)}</span><span class="vp-menu-label"></span><span class="vp-menu-sc"></span><span class="vp-menu-arrow">${it.items ? ARROW : ""}</span>`;
      row.querySelector(".vp-menu-label").textContent = label;
      const sc = it.shortcut || (it.cmd && app.commands.get(it.cmd)?.shortcut);
      if (sc) row.querySelector(".vp-menu-sc").textContent = Array.isArray(sc) ? sc[0] : sc;
      if (it.items) {
        row.classList.add("has-sub");
        const openSub = () => {
          this.close(level + 1);
          for (const r of el.querySelectorAll(".vp-menu-item.sub-open")) r.classList.remove("sub-open");
          row.classList.add("sub-open");
          const sub = this._build(it.items, level + 1, cls);
          const rr = row.getBoundingClientRect();
          const pr = el.getBoundingClientRect();
          this._place(sub, pr.right - 3, rr.top - 1, { sub: true, parentLeft: pr.left });
        };
        row.addEventListener("pointerenter", () => { clearTimeout(this._t); this._t = setTimeout(openSub, 90); });
        row.addEventListener("click", (e) => { e.stopPropagation(); openSub(); });
      } else {
        row.addEventListener("pointerenter", () => {
          clearTimeout(this._t);
          this._t = setTimeout(() => {
            this.close(level + 1);
            for (const r of el.querySelectorAll(".vp-menu-item.sub-open")) r.classList.remove("sub-open");
          }, 120);
        });
        row.addEventListener("click", (e) => {
          e.stopPropagation();
          if (disabled) return;
          const keep = it.check || it.keepOpen;
          if (!keep) this.close();
          if (it.onClick) it.onClick(app);
          else if (it.cmd) app.commands.run(it.cmd, { source: "menu" });
          if (keep) {
            // refresh check marks in place
            const nowChecked = this._checked(it);
            row.querySelector(".vp-menu-mark").innerHTML = this._mark(it, nowChecked);
            row.classList.toggle("checked", nowChecked);
          }
        });
      }
      el.appendChild(row);
    }
    const host = app.dom.overlay || document.body;
    host.appendChild(el);
    this.stack.push(el);
    return el;
  }

  _place(el, x, y, opts = {}) {
    const W = window.innerWidth, H = window.innerHeight;
    const r = el.getBoundingClientRect();
    let left = opts.alignRight ? x - r.width : x;
    let top = opts.above ? y - r.height : y;
    if (opts.sub && left + r.width > W - 4) left = (opts.parentLeft ?? x) - r.width + 3;
    if (left + r.width > W - 4) left = W - 4 - r.width;
    if (left < 4) left = 4;
    if (top + r.height > H - 4) top = Math.max(4, (opts.sub ? H - 4 : y) - r.height);
    if (top < 4) top = 4;
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }
}
