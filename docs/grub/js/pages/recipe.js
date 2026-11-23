// A recipe: ticking ingredients, numbered steps, and the things to do with it.
import { h, statusLine } from "../dom.js";
import { ingredientText, countText, pdfHref } from "../lib.js";
import { addFromRecipe, realIngredients } from "../shopping-list.js";
import { addToPlan } from "../plan.js";
import { recipeHead, recipeColumns } from "../recipe-view.js";
import { starButton } from "../lists.js";
import * as state from "../state.js";
import { SITE_TITLE } from "./home.js";

function shoppingPicker(r, close) {
  // Shown in the ingredients column, in place of the ingredient list: the same lines, each with a tick that
  // means "add this one".
  const items = realIngredients(r);
  const boxes = items.map(() => h("input", { type: "checkbox", checked: true }));
  const status = statusLine();
  const add = h("button", { type: "button", class: "primary" }, "");
  const picked = () => items.filter((_, n) => boxes[n].checked);
  const count = () => { const n = picked().length; add.textContent = "Add " + n + " to the shopping list"; add.disabled = n === 0; };
  boxes.forEach((b) => b.addEventListener("change", count));
  add.addEventListener("click", () => {
    const res = addFromRecipe(state.shopping(), r, picked());
    state.setShopping(res.list);
    status.replaceChildren(
      res.added ? "Added " + res.added + ". " : "",
      res.already ? countText(res.already, "was", "were") + " already on the list. " : "",
      h("a", { href: "#/shopping" }, "See the shopping list"));
  });
  count();
  return h("section", { class: "panel", "aria-label": "Add to shopping list" },
    h("h2", {}, "Add to shopping list"),
    h("p", { class: "quiet small" }, "Untick what you already have."),
    h("ul", { class: "ing" }, items.map((i, n) => h("li", {}, h("label", { class: "ing-line" }, boxes[n], h("span", {}, ingredientText(i)))))),
    h("div", { class: "row" }, add, h("button", { type: "button", onclick: close }, "Close")), status);
}

function wakeSwitch() {
  // Shown only where the browser can keep the screen on, beside the Steps heading, because that is what it is
  // for. The lock is asked for inside the tap, asked for again when the page comes back into view, and let go
  // when switched off or on leaving the page.
  if (!("wakeLock" in navigator)) return { el: null, stop() {} };
  let lock = null;
  const status = h("span", { class: "switch-note small warn", role: "status" });
  const box = h("input", { type: "checkbox", role: "switch", id: "keep-on" });
  const letGo = () => { const was = lock; lock = null; if (was) was.release().catch(() => {}); };
  const get = async () => {
    try {
      const got = await navigator.wakeLock.request("screen");
      if (!box.checked) { got.release().catch(() => {}); return; }
      lock = got;
    } catch {
      box.checked = false;
      status.textContent = "This device would not keep the screen on. Low Power Mode can block it.";
    }
  };
  box.addEventListener("change", () => { status.textContent = ""; if (box.checked) get(); else letGo(); });
  const seen = () => { if (document.visibilityState === "visible" && box.checked && (!lock || lock.released)) get(); };
  document.addEventListener("visibilitychange", seen);
  return {
    el: h("div", { class: "keep-on" }, h("label", { class: "switch", for: "keep-on" }, box, h("span", {}, "Keep screen on")), status),
    stop() { document.removeEventListener("visibilitychange", seen); box.checked = false; letGo(); },
  };
}

export function recipe(app, data, route) {
  const r = data.recipes.find((x) => x.id === route.arg);
  if (!r) {
    document.title = SITE_TITLE;
    app.className = "";
    app.replaceChildren(h("h1", {}, "Not here"), h("p", {}, "That recipe is not here."), h("p", {}, h("a", { href: "#/browse" }, "Browse the recipes")));
    return null;
  }
  document.title = r.title + " | " + SITE_TITLE;

  const wake = wakeSwitch();
  const cols = recipeColumns(r, { besideSteps: wake.el });
  const left = cols.querySelector(".left");
  const list = left.querySelector(".ingredients");
  left.classList.add("sticky");

  let picker = null;
  const shop = h("button", { type: "button", "aria-expanded": "false", onclick: () => {
    const open = !picker;
    shop.setAttribute("aria-expanded", String(open));
    if (picker) { picker.remove(); picker = null; }
    else { picker = shoppingPicker(r, () => { shop.click(); shop.focus(); }); left.append(picker); }
    list.hidden = open; // one list of ingredients on the page at a time
    if (open) picker.scrollIntoView({ block: "nearest" });
  } }, "Add to shopping list");
  const planIt = h("button", { type: "button", onclick: () => {
    state.setPlan(addToPlan(state.plan(), r.id));
    location.hash = "#/prep";
  } }, "Plan a meal");
  // A copy is only kept as a draft once something in it is changed; a copy he already changed is carried on with.
  const edit = h("button", { type: "button", class: "linklike", onclick: () => {
    const mine = state.drafts().find((d) => d.origin && d.origin.id === r.id && !d.separate);
    location.hash = mine ? "#/draft/" + mine.id : "#/draft?copy=" + r.id;
  } }, "Edit a copy as a draft");
  const pdf = pdfHref(r);

  const actions = h("div", { class: "actions" },
    h("div", { class: "row main" }, starButton(r, { withText: true }), shop, planIt),
    h("div", { class: "row minor" },
      h("button", { type: "button", class: "linklike", onclick: () => window.print() }, "Print"),
      pdf ? h("a", { href: pdf, target: "_blank", rel: "noopener" }, "Tablet PDF") : null,
      edit));

  app.className = "recipe";
  app.replaceChildren(
    h("div", { class: "recipe-top" }, h("header", { class: "recipe-head" }, recipeHead(r)), actions),
    cols);
  return () => wake.stop();
}
