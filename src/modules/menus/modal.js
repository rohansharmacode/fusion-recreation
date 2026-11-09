// Fusion-styled modal dialogs (Save, Open, Export, Parameters, Keyboard Shortcuts, About, confirms).
// Look of Fusion's modern (light theme) dialogs: white card with a thin grey border and soft shadow,
// an upper-case title at the top left and a thin × at the top right, buttons at the bottom right
// (the blue primary button is the rightmost), no dimming of the app behind.
// Structure: .mn-backdrop > .mn-modal[data-dialog] > .mn-head / .mn-body / .mn-foot
// Buttons carry data-action ("ok" | "cancel" | custom). While a modal is open a modal input
// handler blocks canvas shortcuts; Esc cancels, Enter (outside text areas) presses the primary button.
import { keyString } from "../../app/core.js";
import { el, esc } from "./util.js";

export function createModals(app) {
  const stack = []; // open handles, topmost last

  function host() { return app.dom.overlay || document.body; }

  /**
   * open({id, title, body, width, height, buttons, footLeft, onClose, onCancel, closable, className, focus})
   * focus: selector of the element to focus first, or false to focus the dialog itself.
   * onCancel(): called when the dialog is dismissed by × / Esc and it has no "cancel" button.
   * buttons: [{action:'ok'|'cancel'|string, label, primary?, disabled?, onClick?(handle) -> false keeps it open}]
   * Returns a handle {root, modal, body, foot, close(reason), button(action), setBusy(bool)}.
   */
  function open(opts = {}) {
    const backdrop = el("div", { class: "mn-backdrop" });
    const modal = el("div", { class: `mn-modal ${opts.className || ""}`, role: "dialog", "aria-modal": "true", dataset: { dialog: opts.id || "modal" } });
    if (opts.width) modal.style.width = typeof opts.width === "number" ? `${opts.width}px` : opts.width;
    if (opts.height) modal.style.height = typeof opts.height === "number" ? `${opts.height}px` : opts.height;
    const head = el("div", { class: "mn-head" },
      el("span", { class: "mn-title", text: opts.title || "" }),
      opts.closable === false ? null : el("button", { class: "mn-x", type: "button", title: "Close", "data-action": "cancel", html: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.25"/></svg>' }));
    const body = el("div", { class: "mn-body" });
    if (opts.body instanceof Node) body.appendChild(opts.body);
    else if (typeof opts.body === "string") body.innerHTML = opts.body;
    const foot = el("div", { class: "mn-foot" });
    const left = el("div", { class: "mn-foot-left" });
    if (opts.footLeft instanceof Node) left.appendChild(opts.footLeft);
    foot.appendChild(left);
    const btns = el("div", { class: "mn-foot-buttons" });
    foot.appendChild(btns);
    modal.append(head, body, foot);
    backdrop.appendChild(modal);

    let closed = false;
    const handle = {
      root: backdrop, modal, body, foot, head, opts,
      close(reason = "cancel", value) {
        if (closed) return;
        closed = true;
        removeInput();
        backdrop.remove();
        const i = stack.indexOf(handle);
        if (i >= 0) stack.splice(i, 1);
        try { opts.onClose && opts.onClose(reason, value); } catch (e) { console.error(e); }
        app.emit("dialog", { open: false, id: opts.id || "modal" });
        // give focus back to the canvas so shortcuts keep working
        if (!stack.length) { try { app.viewport && app.viewport.canvas && app.viewport.canvas.focus({ preventScroll: true }); } catch { /* ignore */ } }
      },
      button(action) { return btns.querySelector(`[data-action="${action}"]`); },
      setTitle(t) { head.querySelector(".mn-title").textContent = t; },
      get closed() { return closed; },
    };

    const btnDefs = opts.buttons || [{ action: "ok", label: "OK", primary: true }, { action: "cancel", label: "Cancel" }];
    // Fusion: secondary buttons first, the blue primary button rightmost
    for (const b of [...btnDefs.filter((x) => !x.primary), ...btnDefs.filter((x) => x.primary)]) {
      const bt = el("button", { type: "button", class: `mn-btn${b.primary ? " mn-primary" : ""}`, "data-action": b.action, text: b.label || b.action });
      if (b.disabled) bt.disabled = true;
      bt.addEventListener("click", () => press(b));
      btns.appendChild(bt);
    }
    function press(b) {
      if (closed) return;
      const bt = handle.button(b.action);
      if (bt && bt.disabled) return;
      let r;
      try { r = b.onClick ? b.onClick(handle) : undefined; } catch (e) { console.error(e); app.toast(String(e.message || e), "error"); return; }
      if (r && typeof r.then === "function") {
        r.then((v) => { if (v !== false) handle.close(b.action); }).catch((e) => { console.error(e); app.toast(String(e.message || e), "error"); });
        return;
      }
      if (r !== false) handle.close(b.action);
    }
    handle.press = (action) => {
      const b = (opts.buttons || []).find((x) => x.action === action);
      if (b) press(b);
      else if (action === "cancel") {
        try { opts.onCancel && opts.onCancel(handle); } catch (e) { console.error(e); }
        handle.close("cancel");
      }
    };
    head.querySelector(".mn-x")?.addEventListener("click", () => handle.press("cancel"));

    // Esc / Enter / shortcut blocking
    const primary = () => (opts.buttons || []).find((b) => b.primary);
    const inputHandler = {
      name: `modal:${opts.id || "modal"}`,
      modal: true,
      onKeyDown(ev) {
        if (stack[stack.length - 1] !== handle) return false;
        if (ev.key === "Escape") { handle.press("cancel"); return true; }
        if (ev.key === "Enter") {
          const t = ev.target;
          if (t && (t.tagName === "BUTTON" || t.tagName === "TEXTAREA" || t.tagName === "A")) return false;
          const p = primary();
          if (p && opts.enterSubmits !== false) { press(p); return true; }
          return false;
        }
        if (ev.key === "Tab") return false;
        // swallow app shortcuts while the dialog is up (the canvas is not usable anyway)
        const k = keyString(ev);
        return !!app.commands.forShortcut(k, app.mode);
      },
      onCancel() { if (stack[stack.length - 1] === handle) { handle.press("cancel"); return true; } return false; },
      onPointerDown() { return true; },
      onPointerMove() { return true; },
      onContextMenu() { return true; },
    };
    const removeInput = app.input.push(inputHandler);
    // Enter in a single-line input (core ignores keys while typing)
    modal.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" || ev.defaultPrevented) return;
      const t = ev.target;
      if (!t || t.tagName !== "INPUT" || t.type === "checkbox" || t.dataset.noSubmit !== undefined) return;
      const p = primary();
      if (p && opts.enterSubmits !== false) { ev.preventDefault(); press(p); }
    });
    backdrop.addEventListener("contextmenu", (ev) => ev.preventDefault());
    backdrop.addEventListener("pointerdown", (ev) => { if (ev.target === backdrop) ev.preventDefault(); });

    // drag by header
    head.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 || ev.target.closest(".mn-x")) return;
      const r = modal.getBoundingClientRect();
      const ox = ev.clientX - r.left, oy = ev.clientY - r.top;
      modal.style.position = "fixed";
      modal.style.margin = "0";
      modal.style.left = `${r.left}px`;
      modal.style.top = `${r.top}px`;
      const move = (e) => {
        const x = Math.max(-r.width + 80, Math.min(window.innerWidth - 80, e.clientX - ox));
        const y = Math.max(0, Math.min(window.innerHeight - 30, e.clientY - oy));
        modal.style.left = `${x}px`;
        modal.style.top = `${y}px`;
      };
      const up = () => { window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true); };
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up, true);
      ev.preventDefault();
    });

    host().appendChild(backdrop);
    stack.push(handle);
    app.emit("dialog", { open: true, id: opts.id || "modal" });
    // initial focus
    modal.tabIndex = -1;
    requestAnimationFrame(() => {
      if (closed) return;
      if (opts.focus === false) { try { modal.focus({ preventScroll: true }); } catch { /* ignore */ } return; }
      const f = (opts.focus && modal.querySelector(opts.focus)) || modal.querySelector("input:not([type=checkbox]):not([type=file]):not([disabled]), select, textarea") || handle.button("ok") || modal.querySelector("button");
      if (f) { try { f.focus({ preventScroll: true }); if (f.select && f.tagName === "INPUT") f.select(); } catch { /* ignore */ } }
    });
    return handle;
  }

  /** confirm({title, message(html), buttons:[{action,label,primary}]}) -> Promise<action> */
  function confirm(o = {}) {
    return new Promise((resolve) => {
      const buttons = (o.buttons || [{ action: "ok", label: "OK", primary: true }, { action: "cancel", label: "Cancel" }]).map((b) => ({ ...b }));
      open({
        id: o.id || "confirm",
        title: o.title || "Fusion",
        width: o.width || 420,
        className: "mn-confirm",
        body: el("div", { class: "mn-message" },
          el("div", { class: `mn-msg-icon mn-msg-${o.kind || "question"}` }),
          el("div", { class: "mn-msg-text", html: o.message || "" })),
        buttons,
        onClose: (reason) => resolve(reason),
      });
    });
  }

  function alert(o = {}) {
    return confirm({ ...o, kind: o.kind || "info", buttons: [{ action: "ok", label: "OK", primary: true }] });
  }

  /** prompt({title, label, value, validate(v)->error|null}) -> Promise<string|null> */
  function prompt(o = {}) {
    return new Promise((resolve) => {
      const input = el("input", { type: "text", class: "mn-input", value: o.value || "", "data-input": o.inputId || "value" });
      const err = el("div", { class: "mn-field-error" });
      let value = null;
      open({
        id: o.id || "prompt",
        title: o.title || "",
        width: o.width || 380,
        body: el("div", { class: "mn-form" },
          el("label", { class: "mn-row" }, el("span", { class: "mn-label", text: o.label || "Name" }), input),
          err),
        buttons: [
          { action: "ok", label: o.okLabel || "OK", primary: true, onClick: () => {
            const v = input.value.trim();
            const e = o.validate ? o.validate(v) : (v ? null : "A value is required");
            if (e) { err.textContent = e; input.classList.add("mn-invalid"); input.focus(); return false; }
            value = v;
            return true;
          } },
          { action: "cancel", label: "Cancel" },
        ],
        onClose: () => resolve(value),
      });
    });
  }

  return {
    open, confirm, alert, prompt,
    get stack() { return stack; },
    top() { return stack[stack.length - 1] || null; },
    closeAll() { for (const h of [...stack].reverse()) h.close("cancel"); },
    esc,
  };
}
