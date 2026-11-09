// Popup menus (toolbar panel dropdowns, File / Help / workspace menus, context menus).
// Exposed as app.ui.menu = { open(items, anchor, opts) -> handle, closeAll(), isOpen() }.
//
// item: "-" | { label, icon?: svg, shortcut?, disabled?, checked?, check?: bool (reserve check column),
//               cmd?: commandId (adds data-cmd), header?: true (non-clickable caption), note?: true,
//               onClick?(), items?: [...] (flyout), tooltip?: () => {title, desc, shortcut, note} }
// anchor: Element | DOMRect | {x, y}.  opts: {placement: 'below'|'right'|'above', align: 'left'|'right',
//          owner?: Element (clicks on it do not count as outside), onClose?(), className?, minWidth?}
import { el, glyph, esc } from "./common.js";

export function createMenu(app, tooltip) {
  const overlay = app.dom.overlay || document.body;
  const stack = []; // open menu levels: {el, items, opts, parentItemEl, active, subTimer}
  let rootHandle = null;

  function rectOf(anchor) {
    if (!anchor) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    if (anchor instanceof Element) return anchor.getBoundingClientRect();
    if (typeof anchor.left === "number") return anchor;
    return { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0, height: 0 };
  }

  function place(menuEl, r, placement, align, gap = 1) {
    const vw = window.innerWidth, vh = window.innerHeight;
    menuEl.style.left = "0px"; menuEl.style.top = "0px";
    menuEl.style.maxHeight = `${vh - 8}px`;
    const w = menuEl.offsetWidth, h = menuEl.offsetHeight;
    let x, y;
    if (placement === "right") {
      // flyouts: the first row lines up with the parent row (border + top padding = 3 px)
      x = r.right - 1; y = r.top - 3;
      if (x + w > vw - 4) x = r.left - w + 1; // flip to the left side
      if (y + h > vh - 4) y = Math.max(4, vh - h - 4);
    } else if (placement === "above") {
      x = align === "right" ? r.right - w : r.left; y = r.top - h - 2;
      if (y < 4) y = r.bottom + 2;
    } else {
      // below the anchor; long menus scroll rather than covering the anchor (Fusion's panel dropdowns)
      x = align === "right" ? r.right - w : r.left; y = r.bottom + gap;
      const below = vh - y - 4, above = r.top - 5;
      if (h > below) {
        if (below >= 240 || below >= above) menuEl.style.maxHeight = `${Math.max(120, below)}px`;
        else if (h <= above) y = r.top - h - 1;
        else { menuEl.style.maxHeight = `${above}px`; y = 4; }
      }
    }
    x = Math.max(4, Math.min(x, vw - w - 4));
    y = Math.max(4, y);
    menuEl.style.left = `${Math.floor(x)}px`;
    menuEl.style.top = `${Math.round(y)}px`;
  }

  function closeFrom(level) {
    if (stack.length <= level) return;
    while (stack.length > level) {
      const m = stack.pop();
      clearTimeout(m.subTimer);
      if (m.parentItemEl) m.parentItemEl.classList.remove("sh-mi-open");
      m.el.remove();
    }
    if (tooltip) tooltip.hide();
    if (!stack.length && rootHandle) {
      const h = rootHandle; rootHandle = null;
      window.removeEventListener("pointerdown", onOutside, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onBlur);
      // menus are mouse-driven in Fusion: don't leave a keyboard focus ring on the trigger
      try { if (h.opts.owner && h.opts.owner.contains(document.activeElement)) document.activeElement.blur(); } catch { /* ignore */ }
      try { h.opts.onClose && h.opts.onClose(); } catch (e) { console.error(e); }
    }
  }
  const closeAll = () => closeFrom(0);

  function onOutside(ev) {
    const t = ev.target;
    if (stack.some((m) => m.el.contains(t))) return;
    if (rootHandle && rootHandle.opts.owner && rootHandle.opts.owner.contains(t)) return;
    closeAll();
  }
  function onBlur() { closeAll(); }

  function enabledItems(level) {
    const m = stack[level];
    return m ? [...m.el.querySelectorAll(":scope > .sh-mi:not(.sh-mi-disabled):not(.sh-mi-header)")] : [];
  }
  function setActive(level, itemEl) {
    const m = stack[level];
    if (!m) return;
    if (m.active) m.active.classList.remove("sh-mi-active");
    m.active = itemEl || null;
    if (itemEl) { itemEl.classList.add("sh-mi-active"); itemEl.scrollIntoView({ block: "nearest" }); }
  }
  function onKey(ev) {
    if (!stack.length) return;
    const level = stack.length - 1;
    const m = stack[level];
    const items = enabledItems(level);
    const idx = items.indexOf(m.active);
    const stop = () => { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); };
    switch (ev.key) {
      case "Escape": stop(); closeFrom(level === 0 ? 0 : level); break;
      case "ArrowDown": stop(); setActive(level, items[(idx + 1) % items.length]); break;
      case "ArrowUp": stop(); setActive(level, items[(idx - 1 + items.length) % items.length]); break;
      case "ArrowRight":
        stop();
        if (m.active && m.active._item && m.active._item.items) { openSub(level, m.active); const sub = enabledItems(level + 1); setActive(level + 1, sub[0]); }
        break;
      case "ArrowLeft": stop(); if (level > 0) closeFrom(level); break;
      case "Enter": case " ": stop(); if (m.active) activate(level, m.active); break;
      default:
        // swallow plain keys while a menu is open so command shortcuts don't fire underneath
        if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) stop();
    }
  }

  function activate(level, itemEl) {
    const it = itemEl._item;
    if (!it || it.disabled || it.header) return;
    if (it.items) { openSub(level, itemEl); return; }
    if (it.keepOpen) { try { it.onClick && it.onClick(itemEl); } catch (e) { console.error(e); } return; }
    closeAll();
    // run after the menu is gone so dialogs/tools that open take focus cleanly
    setTimeout(() => { try { it.onClick && it.onClick(); } catch (e) { console.error(e); app.toast(String(e.message || e), "error"); } }, 0);
  }

  function openSub(level, itemEl, override) {
    const it = itemEl._item;
    if (stack[level]) clearTimeout(stack[level].subTimer); // a pending "close flyout" must not undo this
    const next = stack[level + 1];
    if (next && next.parentItemEl === itemEl && !!next.override === !!override) return;
    closeFrom(level + 1);
    const items = override || it.items;
    if (!items || !items.length) return;
    itemEl.classList.add("sh-mi-open");
    build(items, itemEl.getBoundingClientRect(), { placement: "right" }, itemEl);
    stack[stack.length - 1].override = !!override;
  }

  // Row layout (see .sh-menu in style.css): [icon 16][label][shortcut][tail: more / submenu arrow].
  // Checkable rows show a check box (check lists) or a tick (radio-like choices) in the icon column.
  function checkMark(it) {
    if (!it.check) return null;
    if (it.icon) return null;
    if (it.checkStyle === "tick") return it.checked ? `<span class="sh-mi-tick">${glyph("sh-check", 14)}</span>` : "";
    return `<span class="sh-mi-checkbox">${it.checked ? glyph("sh-check", 10) : ""}</span>`;
  }
  function itemRow(it, level) {
    if (it === "-" || it === null) return el("div", "sh-msep", { role: "separator" });
    if (it.header) return el("div", `sh-mi sh-mi-header${it.note ? " sh-mi-note" : ""}${it.className ? " " + it.className : ""}`, { text: it.label });
    const cls = ["sh-mi"];
    if (it.disabled) cls.push("sh-mi-disabled");
    if (it.checked) cls.push("sh-mi-checked");
    if (it.items) cls.push("sh-mi-sub");
    if (it.check && it.icon) cls.push("sh-mi-iconcheck");
    if (it.className) cls.push(it.className);
    const row = el("div", cls.join(" "), { role: it.check ? "menuitemcheckbox" : "menuitem", "aria-checked": it.check ? String(!!it.checked) : null, "data-cmd": it.cmd, "data-menu-item": it.key || it.label, "aria-disabled": it.disabled ? "true" : null });
    const mark = checkMark(it);
    const ic = el("span", "sh-mi-icon", { html: mark !== null ? mark : (it.icon || "") });
    const lb = el("span", "sh-mi-label", { text: it.label });
    const sc = el("span", "sh-mi-shortcut", { text: it.shortcut || "" });
    const tail = el("span", "sh-mi-tail");
    const ar = el("span", "sh-mi-arrow", { html: it.items ? glyph("sh-tri-right") : "" });
    row.append(ic, lb, sc, tail);
    if (typeof it.more === "function") {
      // Fusion's per-item "more" affordance (Pin to Toolbar ...), shown while the row is hovered
      const more = el("span", "sh-mi-more", { role: "button", "aria-label": "More", html: glyph("sh-more", 14) });
      more.addEventListener("click", (ev) => { ev.stopPropagation(); openSub(level, row, it.more()); });
      tail.append(more);
    }
    tail.append(ar);
    row._item = it;
    row.addEventListener("pointerenter", () => {
      setActive(level, row);
      const m = stack[level];
      if (!m) return;
      clearTimeout(m.subTimer);
      const child = stack[level + 1];
      if (child && child.parentItemEl === row) return; // its flyout is already open
      if (it.items) m.subTimer = setTimeout(() => openSub(level, row), 140);
      else m.subTimer = setTimeout(() => closeFrom(level + 1), 220);
      if (tooltip && it.tooltip) tooltip.schedule(row, it.tooltip, { placement: "right", delay: 700, size: "large" });
    });
    row.addEventListener("pointerleave", () => { if (tooltip) tooltip.cancel(row); });
    row.addEventListener("click", (ev) => { ev.stopPropagation(); activate(level, row); });
    row.addEventListener("contextmenu", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      if (it.onContext) it.onContext(ev, row);
    });
    return row;
  }

  function build(items, anchorRect, opts, parentItemEl) {
    const level = stack.length;
    const menuEl = el("div", `sh-menu${opts.className ? " " + opts.className : ""}`, { role: "menu", "data-level": level });
    if (opts.minWidth) menuEl.style.minWidth = `${opts.minWidth}px`;
    if (opts.title) menuEl.append(el("div", "sh-menu-title", { text: opts.title }));
    let lastSep = true;
    const rows = [];
    for (const it of items) {
      if (it === "-") { if (lastSep) continue; lastSep = true; rows.push("-"); continue; }
      lastSep = false;
      rows.push(it);
    }
    while (rows[rows.length - 1] === "-") rows.pop();
    for (const it of rows) menuEl.append(itemRow(it, level));
    if (!rows.length) menuEl.append(el("div", "sh-mi sh-mi-header sh-mi-note", { text: "(empty)" }));
    menuEl.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    menuEl.addEventListener("contextmenu", (ev) => ev.preventDefault());
    menuEl.addEventListener("wheel", (ev) => ev.stopPropagation(), { passive: true });
    overlay.appendChild(menuEl);
    stack.push({ el: menuEl, items, opts, parentItemEl, active: null, subTimer: 0 });
    place(menuEl, anchorRect, opts.placement || "below", opts.align || "left", opts.gap ?? 1);
    return menuEl;
  }

  function open(items, anchor, opts = {}) {
    closeAll();
    if (tooltip) tooltip.hide();
    const menuEl = build(items, rectOf(anchor), opts, null);
    rootHandle = { el: menuEl, opts, close: closeAll };
    window.addEventListener("pointerdown", onOutside, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onBlur);
    return rootHandle;
  }

  return {
    open,
    closeAll,
    isOpen: () => stack.length > 0,
    /** true while the menu opened with this owner element is showing */
    isOpenFor: (owner) => !!(rootHandle && rootHandle.opts.owner === owner),
    escapeHtml: esc,
  };
}
