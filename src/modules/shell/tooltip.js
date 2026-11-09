// Delayed rich tooltips in Fusion's style: a small tooltip (name + shortcut) appears first and
// expands with the description after a longer hover (toolbar buttons); menu items show the large
// tooltip straight away. Exposed as app.ui.tooltip.
//
// info: () => ({ title, desc?, shortcut?, note? })
// tooltip.attach(el, info, {placement: 'below'|'right'|'above', size: 'small'|'large', delay})
import { el } from "./common.js";

export function createTooltip(app) {
  const overlay = app.dom.overlay || document.body;
  const tip = el("div", "sh-tip", { role: "tooltip" });
  tip.style.display = "none";
  overlay.appendChild(tip);
  let owner = null, timer = 0, expandTimer = 0, current = null;
  const DELAY = 450, EXPAND = 1100;

  function render(info, expanded) {
    tip.innerHTML = "";
    const head = el("div", "sh-tip-head", null, el("span", "sh-tip-title", { text: info.title || "" }));
    if (info.shortcut) head.append(el("span", "sh-tip-key", { text: info.shortcut }));
    tip.append(head);
    if (expanded) {
      if (info.desc) tip.append(el("div", "sh-tip-desc", { text: info.desc }));
      if (info.note) tip.append(el("div", "sh-tip-note", { text: info.note }));
      if (info.more !== false && info.desc) tip.append(el("div", "sh-tip-more", { text: "Press Ctrl+/ for more help." }));
    }
    tip.classList.toggle("sh-tip-large", !!expanded);
  }

  function position(target, opts) {
    const placement = opts.placement || "below";
    const r = target.getBoundingClientRect();
    tip.style.left = "0px"; tip.style.top = "0px";
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let x, y;
    if (placement === "right") { x = r.right + 6; y = r.top; if (x + w > vw - 4) x = r.left - w - 6; }
    else if (placement === "above") { x = r.left; y = r.top - h - 6; if (y < 4) y = r.bottom + 6; }
    else {
      x = r.left; y = r.bottom + 6;
      // toolbar buttons: show below the whole toolbar so the panel labels stay readable
      if (typeof opts.minY === "function") { try { y = Math.max(y, opts.minY()); } catch { /* ignore */ } }
      if (y + h > vh - 4) y = r.top - h - 6;
    }
    x = Math.max(4, Math.min(x, vw - w - 4));
    y = Math.max(4, Math.min(y, vh - h - 4));
    tip.style.left = `${Math.round(x)}px`;
    tip.style.top = `${Math.round(y)}px`;
  }

  function show(target, infoFn, opts, expanded) {
    let info;
    try { info = infoFn(); } catch { info = null; }
    if (!info || !info.title || !target.isConnected) { hide(); return; }
    current = { target, infoFn, opts };
    render(info, expanded);
    tip.style.display = "block";
    position(target, opts);
  }

  function schedule(target, infoFn, opts = {}) {
    if (owner === target && tip.style.display === "block") return;
    hide();
    owner = target;
    const large = opts.size === "large";
    timer = setTimeout(() => {
      if (owner !== target) return;
      show(target, infoFn, opts, large);
      if (!large) expandTimer = setTimeout(() => { if (owner === target) show(target, infoFn, opts, true); }, EXPAND);
    }, opts.delay ?? DELAY);
  }
  function cancel(target) { if (!target || owner === target) hide(); }
  function hide() {
    clearTimeout(timer); clearTimeout(expandTimer);
    owner = null; current = null;
    tip.style.display = "none";
  }

  function attach(target, infoFn, opts = {}) {
    target.addEventListener("pointerenter", (ev) => { if (ev.pointerType !== "touch") schedule(target, infoFn, opts); });
    target.addEventListener("pointerleave", () => cancel(target));
    target.addEventListener("pointerdown", () => hide());
    return target;
  }

  window.addEventListener("wheel", hide, { passive: true });
  window.addEventListener("blur", hide);
  window.addEventListener("keydown", hide, true);

  return { attach, schedule, cancel, hide, refresh() { if (current) show(current.target, current.infoFn, current.opts, tip.classList.contains("sh-tip-large")); }, el: tip };
}
