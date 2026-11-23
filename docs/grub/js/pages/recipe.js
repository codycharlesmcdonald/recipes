// A recipe: ticking ingredients, numbered steps, and the things to do with it. One of his own recipes also
// has its recipe file to copy or download, and can be deleted from the device.
import { h, put, statusLine, ask, copyWithFallback, download, takeWord } from "../dom.js";
import { ingredientText, countText, pdfHref } from "../lib.js";
import { addFromRecipe, realIngredients } from "../shopping-list.js";
import { addToPlan } from "../plan.js";
import { recipeFileText, recipeFileName } from "../recipe-format.js";
import { recipeHead, recipeColumns } from "../recipe-view.js";
import { isOwnId, plainId, twinOf, sameWords, recipeFileOf } from "../own.js";
import { starButton } from "../lists.js";
import * as state from "../state.js";
import { SITE_TITLE } from "./home.js";

function ownLines(r, data, onDelete) {
  // What is said under the heading about his own recipes: on one of them, that it is his and where it is
  // kept, and how it stands beside the cookbook; on a cookbook recipe, that he has a version of his own.
  const link = (x) => h("a", { href: "#/r/" + x.id }, x.title);
  if (r.own !== true) {
    const mine = data.recipes.filter((x) => x.own === true && (x.base || plainId(x.id)) === r.id);
    return mine.length ? h("p", { class: "own-line" }, "You have your own version of this on this device: ",
      mine.map((x, n) => [n ? ", " : "", link(x)]), ".") : null;
  }
  const lines = [h("p", { class: "own-line" }, state.keeping()
    ? "This recipe is yours, not part of the cookbook. It is kept on this device, and a browser can clear what a site keeps, so the recipe file is the copy that lasts."
    : "This recipe is yours, not part of the cookbook. " + state.NOT_KEPT + " Download its recipe file to keep it.")];
  const twin = twinOf(r, data.book);
  if (twin && sameWords(r, twin)) {
    // the cookbook took the same recipe in later: his copy has nothing the cookbook does not. Its question
    // is asked right under this line, where the button is.
    const here = h("div", { class: "own-ask" });
    lines.push(h("p", { class: "own-line with-action" },
      h("span", {}, "The cookbook has this recipe now, word for word. You can delete your copy."),
      h("button", { type: "button", class: "linklike", onclick: (e) => onDelete(e.currentTarget, here) }, "Delete your copy")), here);
  } else if (twin) {
    lines.push(h("p", { class: "own-line" }, r.base ? ["It is your version of ", link(twin), ", which is in the cookbook."] : ["The cookbook has its own ", link(twin), "."]));
  }
  return lines;
}

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
      status.textContent = "This device would not keep the screen on. A battery saver setting can block it.";
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
    if (isOwnId(route.arg)) {
      // an address of someone's own recipe: it was never on the site for everyone, so say where it lives, that
      // it may have been deleted (or cleared by the browser) here, and where on Draft a recipe file is loaded
      app.replaceChildren(h("h1", {}, "Not on this device"),
        h("p", {}, "That recipe is not on this device. It may have been deleted, or added on another device: a recipe someone adds is kept only on the device it was added on. If you have its recipe file, load it under Your recipes, at the foot of the Draft page."),
        h("p", {}, h("a", { href: "#/draft" }, "Go to Draft")), h("p", {}, h("a", { href: "#/browse" }, "Browse the recipes")));
      return null;
    }
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
  // His own recipe is changed the same way, and saving the draft puts the change into it.
  const edit = h("button", { type: "button", class: "linklike", onclick: () => {
    const mine = state.drafts().find((d) => d.origin && d.origin.id === r.id && !d.separate);
    location.hash = mine ? "#/draft/" + mine.id : "#/draft?copy=" + r.id;
  } }, r.own === true ? "Edit" : "Edit a copy as a draft");
  const pdf = pdfHref(r);

  // his own recipe: its file, and Delete, answered in a line of their own right under the things to do with
  // it (in a wide window that is the column beside the title, under the links that were pressed)
  const status = statusLine();
  const copyHost = h("div", {});
  const askHost = h("div", {});
  const said = h("div", { class: "own-said" }, status, copyHost, askHost);
  const file = r.own === true ? recipeFileOf(r) : null;
  let asking = null; // where the question on show is, so only one is open at a time
  const askDelete = (from, where = askHost) => {
    copyHost.replaceChildren();
    if (asking && asking !== where) asking.replaceChildren();
    asking = where;
    ask(where, "Delete " + r.title + " from this device? It comes off Saved and out of the meal plan. Things from it on the shopping list stay. Without its recipe file it is gone for good.",
      "Yes, delete it", "Keep it", () => {
        // A browser that saves nothing held this delete for the visit only. A recipe the device itself held
        // comes back when the page is reloaded; one added on this visit was never kept, and stays gone.
        const onDevice = state.myRecipeOnDevice(r.id);
        const result = state.deleteMyRecipe(r.id);
        if (result === "full") { status.textContent = "Not deleted. The browser would not save the change. Reload the page and try again."; return; }
        if (result === "newer") { status.textContent = "Not deleted. A newer version of this site has been used in this browser. Reload the page and try again."; return; }
        wake.stop();
        document.title = "Deleted | " + SITE_TITLE;
        app.className = "";
        app.replaceChildren(h("h1", {}, "Deleted"),
          h("p", { role: "status" }, result === "kept" ? "Deleted " + r.title + " from this device."
            : onDevice ? "Deleted " + r.title + " for this visit. " + state.NOT_KEPT : "Deleted " + r.title + "."),
          h("p", {}, h("a", { href: "#/browse" }, "Browse the recipes")));
        app.focus({ preventScroll: true });
      }, () => { if (from.isConnected) from.focus(); });
  };
  const ownActions = file ? [
    edit,
    h("button", { type: "button", class: "linklike", onclick: () => {
      copyHost.replaceChildren();
      download(recipeFileName(file), recipeFileText(file), "application/json");
      status.textContent = "Downloaded " + recipeFileName(file) + ". Look in Downloads.";
    } }, "Download recipe file"),
    h("button", { type: "button", class: "linklike", onclick: () => {
      copyWithFallback(recipeFileText(file), status, copyHost, "Copied the recipe file, " + recipeFileName(file) + ".");
    } }, "Copy recipe file"),
    h("button", { type: "button", class: "linklike", onclick: (e) => askDelete(e.currentTarget) }, "Delete"),
  ] : [edit];

  const actions = h("div", { class: "actions" },
    h("div", { class: "row main" }, starButton(r, { withText: true }), shop, planIt),
    h("div", { class: "row minor" },
      h("button", { type: "button", class: "linklike", onclick: () => window.print() }, "Print"),
      pdf ? h("a", { href: pdf, target: "_blank", rel: "noopener" }, "Tablet PDF") : null,
      ownActions));

  status.textContent = takeWord() || ""; // "Added to your recipes", left by Draft
  app.className = "recipe";
  put(app,
    h("div", { class: "recipe-top" }, h("header", { class: "recipe-head" }, recipeHead(r), ownLines(r, data, askDelete)), actions, file ? said : null),
    cols);
  return () => wake.stop();
}
