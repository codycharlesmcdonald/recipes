import { haystack, matches, minutesText, ingredientText, shoppingLine, shortcutUrl, buildIcs, icsFileName } from "./lib.js";

const app = document.getElementById("app");
const SITE_TITLE = "Hi, My Name is Food";
let DATA = null;
let query = "";

// h("p", {class: "x"}, "text", child): builds elements without ever parsing recipe text as HTML
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function timeLabel(r) {
  return minutesText(r.total_minutes);
}

/* ---------- home: search and the sections ---------- */

function renderHome() {
  document.title = SITE_TITLE;
  app.className = "";
  const results = h("div", {});
  const input = h("input", {
    class: "search", type: "search", placeholder: "Search by name or ingredient", "aria-label": "Search recipes",
    autocomplete: "off", autocapitalize: "off", spellcheck: "false", value: query,
    oninput: (e) => { query = e.target.value; draw(); },
  });

  function draw() {
    const found = DATA.recipes.filter((r) => matches(r._words, query));
    results.replaceChildren();
    if (query.trim()) {
      results.append(h("p", { class: "count quiet small" }, found.length === 1 ? "1 recipe" : found.length + " recipes"));
      if (!found.length) results.append(h("p", {}, "Nothing matches that. Try one word, like an ingredient."));
      else results.append(rows(found, true));
      return;
    }
    const sections = [...DATA.sections];
    for (const r of DATA.recipes) if (!sections.includes(r.section || "Other")) sections.push(r.section || "Other");
    for (const s of sections) {
      const list = DATA.recipes.filter((r) => (r.section || "Other") === s);
      if (!list.length) continue;
      results.append(h("h2", {}, s), rows(list, false));
    }
  }

  function rows(list, showSection) {
    return h("ul", { class: "rows" }, list.map((r) => h("li", {},
      h("a", { href: "#/r/" + r.id },
        h("span", { class: "t" }, r.title),
        h("span", { class: "m" }, (showSection && r.section ? r.section + ", " : "") + timeLabel(r))))));
  }

  app.replaceChildren(input, results);
  draw();
}

/* ---------- recipe page ---------- */

function renderRecipe(id) {
  const r = DATA.recipes.find((x) => x.id === id);
  if (!r) {
    document.title = SITE_TITLE;
    app.className = "";
    app.replaceChildren(h("p", {}, "That recipe is not here."), h("p", {}, h("a", { href: "#/" }, "All recipes")));
    return;
  }
  document.title = r.title + " | " + SITE_TITLE;
  app.className = "wide";

  const meta = ["Ready in " + (r.time_text || minutesText(r.total_minutes))];
  if (r.time_text && r.total_minutes_estimated) meta[0] += " (about " + minutesText(r.total_minutes) + ")";
  if (r.yield) meta.push(/^(serves|makes)/i.test(r.yield) ? r.yield : "Serves " + r.yield);
  if (r.source) meta.push("Credit: " + r.source.replace(/\.$/, ""));

  const panelHost = h("div", {});
  let open = null;
  const buttons = {};
  function toggle(name, build) {
    const was = open;
    open = null;
    panelHost.replaceChildren();
    for (const b of Object.values(buttons)) b.setAttribute("aria-expanded", "false");
    if (was === name) return;
    open = name;
    buttons[name].setAttribute("aria-expanded", "true");
    panelHost.append(build());
  }
  buttons.shop = h("button", { type: "button", "aria-expanded": "false", onclick: () => toggle("shop", () => shoppingPanel(r)) }, "Shopping list");
  buttons.plan = h("button", { type: "button", "aria-expanded": "false", onclick: () => toggle("plan", () => planPanel(r)) }, "Plan a meal");
  const actions = h("div", { class: "actions" },
    buttons.shop, buttons.plan,
    h("button", { type: "button", onclick: () => window.print() }, "Print"),
    r.pdf ? h("a", { class: "btn", href: r.pdf, target: "_blank", rel: "noopener" }, "Tablet PDF") : null);

  const ingredients = h("div", {}, h("h2", {}, "Ingredients"), r.ingredients.map((g) => [
    g.section ? h("h3", {}, g.section) : null,
    h("ul", { class: "ing" }, g.items.map((i) => i.aside
      ? h("li", { class: "aside" }, i.name)
      : h("li", {}, h("label", {}, h("input", { type: "checkbox" }),
        h("span", {}, [i.qty, i.unit].filter(Boolean).length ? h("span", { class: "q" }, [i.qty, i.unit].filter(Boolean).join(" ") + " ") : null,
          i.name, i.note ? h("span", { class: "n" }, ", " + i.note) : null))))),
  ]));

  const single = r.steps.length === 1 && !r.steps[0].section;
  const steps = h("div", {}, single ? h("h2", {}, "Steps") : null, r.steps.map((g) => [
    g.section ? h("h2", {}, g.section) : null,
    h("ol", { class: "steps" }, g.items.map((s) => h("li", {}, s))),
  ]), r.notes && r.notes.length ? [h("h2", {}, "Tips"), h("ul", { class: "tips" }, r.notes.map((n) => h("li", {}, n)))] : null);

  app.replaceChildren(...[
    h("a", { class: "back", href: "#/" }, "All recipes"),
    h("h1", {}, r.title),
    h("p", { class: "meta" }, meta.join(". ") + "."),
    r.headnote ? h("p", { class: "headnote" }, r.headnote) : null,
    actions, panelHost,
    h("div", { class: "cols" }, h("div", { class: "left" }, ingredients), h("div", { class: "right" }, steps)),
  ].filter(Boolean));
  window.scrollTo(0, 0);
}

/* ---------- shopping list: to Reminders through the Shortcut, or copied ---------- */

function shoppingPanel(r) {
  const items = r.ingredients.flatMap((g) => g.items).filter((i) => !i.aside);
  const boxes = items.map(() => h("input", { type: "checkbox", checked: true }));
  const status = h("p", { class: "status", role: "status" });
  const send = h("button", { type: "button", class: "primary" }, "");
  const picked = () => items.filter((_, n) => boxes[n].checked).map(shoppingLine);
  const count = () => { const n = picked().length; send.textContent = "Add " + n + " to Reminders"; send.disabled = n === 0; };
  boxes.forEach((b) => b.addEventListener("change", count));
  send.addEventListener("click", () => {
    status.textContent = "Sent to Shortcuts. If nothing happened, use Copy list and paste it into Reminders.";
    window.location.href = shortcutUrl(picked());
  });
  const copy = h("button", { type: "button", onclick: async () => {
    try { await navigator.clipboard.writeText(picked().join("\n")); status.textContent = "Copied. Open Reminders, Shopping List, and paste."; }
    catch { status.textContent = "This browser would not copy. Select the list above by hand."; }
  } }, "Copy list");
  count();
  return h("section", { class: "panel" },
    h("h2", {}, "Shopping list"),
    h("p", { class: "quiet small" }, "Untick what you already have."),
    h("ul", { class: "ing" }, items.map((i, n) => h("li", {}, h("label", {}, boxes[n], h("span", {}, ingredientText(i)))))),
    h("div", { class: "row" }, send, copy), status);
}

/* ---------- plan a meal: a calendar file from the total time and the meal time ---------- */

function pad(n) { return String(n).padStart(2, "0"); }

function planPanel(r) {
  const now = new Date();
  let saved = "18:30";
  try { saved = localStorage.getItem("eatAt") || saved; } catch { /* storage can be off; the default stands */ }
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +saved.slice(0, 2), +saved.slice(3, 5));
  if (first.getTime() - r.total_minutes * 60000 < now.getTime()) first.setDate(first.getDate() + 1);
  const date = h("input", { type: "date", value: first.getFullYear() + "-" + pad(first.getMonth() + 1) + "-" + pad(first.getDate()) });
  const time = h("input", { type: "time", step: "300", value: saved });
  const alarm = h("select", {},
    h("option", { value: "0" }, "When cooking starts"), h("option", { value: "10", selected: true }, "10 minutes before"),
    h("option", { value: "30" }, "30 minutes before"), h("option", { value: "60" }, "1 hour before"), h("option", { value: "none" }, "None"));
  const say = h("p", { class: "say" });
  const status = h("p", { class: "status", role: "status" });
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" });
  const fmtTime = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

  function mealMs() {
    const [y, mo, d] = date.value.split("-").map(Number), [hh, mm] = time.value.split(":").map(Number);
    if (!y || !mo || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return new Date(y, mo - 1, d, hh, mm).getTime();
  }
  function draw() {
    const meal = mealMs();
    if (meal === null) { say.textContent = "Pick a day and a time."; return; }
    const start = meal - r.total_minutes * 60000;
    say.textContent = "Start cooking " + fmt.format(start) + ". Eat at " + fmtTime.format(meal) + ". " + minutesText(r.total_minutes) + "."
      + (start < Date.now() ? " That start time has already passed." : "");
  }
  function ics() {
    const meal = mealMs();
    if (meal === null) return null;
    try { localStorage.setItem("eatAt", time.value); } catch { /* fine without it */ }
    return buildIcs({ id: r.id, title: r.title, totalMinutes: r.total_minutes, mealMs: meal, nowMs: Date.now(),
      alarmMinutes: alarm.value === "none" ? null : Number(alarm.value), siteUrl: location.origin + location.pathname });
  }
  [date, time].forEach((el) => el.addEventListener("input", draw));

  const add = h("button", { type: "button", class: "primary", onclick: () => {
    const text = ics();
    if (!text) return;
    const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" })), download: icsFileName(r.title) });
    document.body.append(a); a.click(); a.remove();
    status.textContent = "The calendar file is in Downloads. Open it and Calendar asks which calendar to add it to.";
  } }, "Add to Calendar");
  const openIt = h("button", { type: "button", onclick: () => {
    const text = ics();
    if (text) window.location.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(text);
  } }, "Open in Calendar (iPhone)");
  draw();
  return h("section", { class: "panel" },
    h("h2", {}, "Plan a meal"),
    h("label", { class: "field" }, h("span", {}, "Day"), date),
    h("label", { class: "field" }, h("span", {}, "Eat at"), time),
    h("label", { class: "field" }, h("span", {}, "Alert"), alarm),
    say, h("div", { class: "row" }, add, openIt), status);
}

/* ---------- routing ---------- */

function route() {
  const m = location.hash.match(/^#\/r\/([a-z0-9-]+)$/);
  if (m) renderRecipe(m[1]); else renderHome();
}

async function start() {
  try {
    const res = await fetch("data/recipes.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("status " + res.status);
    DATA = await res.json();
    for (const r of DATA.recipes) r._words = haystack(r);
  } catch (e) {
    app.replaceChildren(h("p", {}, "The recipes did not load. Check the connection and reload."));
    return;
  }
  window.addEventListener("hashchange", route);
  route();
}

start();
