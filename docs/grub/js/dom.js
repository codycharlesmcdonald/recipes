// Small page helpers. Text is only ever put on the page as text nodes, never parsed as HTML.

const PROPS = new Set(["value", "checked", "selected", "disabled", "readOnly", "open"]);

// h("p", { class: "x" }, "text", child): builds an element
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (PROPS.has(k)) { el[k] = v; if (k === "value" && tag !== "textarea") el.setAttribute("value", v); }
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const SVG = "http://www.w3.org/2000/svg";

export function starIcon() {
  // drawn here so it looks the same on every device; filled or hollow by the button's aria-pressed, in the CSS
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "star-icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", "M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z");
  svg.append(path);
  return svg;
}

export function crossIcon() {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "cross-icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", "M7 7l10 10M17 7L7 17");
  svg.append(path);
  return svg;
}

// put(el, a, maybeNull, [b, c]): replaces what is inside el, skipping anything that is not there
export function put(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
  return el;
}

export function statusLine() {
  return h("p", { class: "status", role: "status" });
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// Copies, and says what happened. When the browser will not copy, the text is put in a box to select by hand.
export async function copyWithFallback(text, status, host, okMessage) {
  host.replaceChildren();
  if (await copyText(text)) { status.textContent = okMessage; return true; }
  status.textContent = "This browser would not copy. The text is in the box below: select it and copy it.";
  const box = h("textarea", { class: "copybox", readOnly: true, rows: String(Math.min(12, text.split("\n").length + 1)), "aria-label": "Text to copy", value: text });
  host.append(box);
  box.focus();
  box.select();
  return false;
}

export function download(fileName, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: fileName, class: "offscreen" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// A question asked inside the page (never alert, confirm or prompt). Focus goes to the safe answer.
export function ask(host, question, yesLabel, noLabel, onYes, onClose) {
  const close = () => { host.replaceChildren(); if (onClose) onClose(); };
  const no = h("button", { type: "button", onclick: close }, noLabel);
  const yes = h("button", { type: "button", class: "danger", onclick: () => { close(); onYes(); } }, yesLabel);
  host.replaceChildren(h("div", { class: "ask", role: "group", "aria-label": question },
    h("p", { class: "ask-q" }, question), h("div", { class: "row" }, yes, no)));
  no.focus();
}

// A side column (class "sticky") stays in view while the page scrolls, and never gets a scroll of its own that
// would hide part of it. One that fits in the window sticks to the top. One taller than the window scrolls with
// the page until its end shows, then stays there. Measured again whenever the column or the window changes
// size. Returns what to call when the page is left.
export function watchSticky(root) {
  const els = [...root.querySelectorAll(".sticky")];
  if (!els.length || typeof ResizeObserver !== "function") return () => {};
  const fit = () => {
    for (const el of els) {
      const fits = el.offsetHeight <= window.innerHeight - 32;
      el.classList.toggle("fits", fits);
      el.classList.toggle("tall", !fits);
    }
  };
  const watcher = new ResizeObserver(fit);
  els.forEach((el) => watcher.observe(el));
  window.addEventListener("resize", fit);
  fit();
  return () => { watcher.disconnect(); window.removeEventListener("resize", fit); };
}

export function dayAndTime(ms) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(ms);
}
