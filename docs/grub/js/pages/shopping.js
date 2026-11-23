// Shopping: one running list, grouped by the recipe each thing came from. The list lives here, in the site.
// The way out of it is Copy list: the things still to get as plain lines, to paste wherever a list is kept.
// The page reads in the order it is used: what to do with the list first (so Copy list is at the top on a
// phone and early for the keyboard), then the list, then a box to add something.
import { h, put, crossIcon, statusLine, copyWithFallback, ask } from "../dom.js";
import { amountText } from "../lib.js";
import { addOwn, setGot, removeItem, clearTicked, counts, groups, copyLines } from "../shopping-list.js";
import * as state from "../state.js";
import { SITE_TITLE } from "./home.js";

const NOTHING_TO_COPY = "Everything is ticked, so there is nothing to copy.";

export function shopping(app) {
  document.title = "Shopping | " + SITE_TITLE;
  const summary = h("p", { class: "count quiet small" });
  const body = h("div", {});
  const status = statusLine();
  const askHost = h("div", {});
  const copyHost = h("div", {});
  // With nothing left to copy the button stays where the keyboard can reach it, marked as unavailable, and
  // says why: in its tooltip for the mouse, and in the status line when it is pressed.
  const copy = h("button", { type: "button", class: "primary", onclick: () => {
    const lines = copyLines(state.shopping());
    if (!lines.length) { copyHost.replaceChildren(); status.textContent = NOTHING_TO_COPY; return; }
    copyWithFallback(lines.join("\n"), status, copyHost, "Copied " + lines.length + ". Paste it wherever you keep your list.");
  } }, "Copy list");
  const clearGot = h("button", { type: "button", onclick: () => {
    const before = state.shopping(), after = clearTicked(before);
    state.setShopping(after);
    draw();
    status.textContent = before.length === after.length ? "Nothing is ticked." : "Took " + (before.length - after.length) + " off the list.";
    if (!after.length) own.focus({ preventScroll: true });
  } }, "Clear ticked");
  const clearAll = h("button", { type: "button", onclick: () => {
    ask(askHost, "Clear the whole list?", "Yes, clear it", "Keep it", () => {
      state.setShopping([]);
      draw();
      status.textContent = "The list is empty.";
      own.focus({ preventScroll: true });
    }, () => clearAll.focus());
  } }, "Clear all");
  const actions = h("div", { class: "stack" }, copy, h("div", { class: "split" }, clearGot, clearAll));

  const own = h("input", { type: "text", id: "own-item", autocomplete: "off", enterkeyhint: "done" });
  const ownForm = h("form", { class: "add-own", onsubmit: (e) => {
    e.preventDefault();
    const res = addOwn(state.shopping(), own.value);
    if (!res.added && !res.already) { status.textContent = "Type what to add first."; return; }
    state.setShopping(res.list);
    status.textContent = res.added ? "Added " + own.value.trim() + "." : "That was already on the list. It is back on the to-get side.";
    own.value = "";
    draw();
    own.focus();
  } }, h("label", { class: "field", for: "own-item" }, h("span", {}, "Add something of your own"), own), h("button", { type: "submit" }, "Add"));

  function draw() {
    const list = state.shopping(), c = counts(list);
    summary.textContent = list.length ? c.toGet + " to get" + (c.got ? ", " + c.got + " got" : "") + ". " + state.keptWords("Kept on this device.") : "";
    copyHost.replaceChildren();
    askHost.replaceChildren();
    if (copyLines(list).length) { copy.removeAttribute("aria-disabled"); copy.removeAttribute("title"); }
    else { copy.setAttribute("aria-disabled", "true"); copy.setAttribute("title", NOTHING_TO_COPY); }
    actions.hidden = !list.length;

    if (!list.length) {
      body.replaceChildren(h("p", { class: "empty" }, "Nothing on the list. Open a recipe and press Add to shopping list, or add something of your own."));
      return;
    }
    body.replaceChildren(...groups(list).map((g) => h("section", { class: "shop-group" },
      h("h2", {}, g.recipeId ? h("a", { href: "#/r/" + g.recipeId }, g.title) : g.title),
      h("ul", { class: "shop" }, g.items.map((x) => h("li", { class: x.got ? "got" : null, "data-key": x.key },
        h("label", {},
          h("input", { type: "checkbox", checked: x.got, onchange: (e) => { state.setShopping(setGot(state.shopping(), x.key, e.target.checked)); redrawKeeping(x.key); } }),
          h("span", { class: "thing" }, h("span", { class: "nm" }, x.name.charAt(0).toUpperCase() + x.name.slice(1)),
            amountText(x) ? [h("span", { class: "leader", "aria-hidden": "true" }), h("span", { class: "amt" }, " " + amountText(x))] : null)),
        h("button", { type: "button", class: "icon-btn remove", "aria-label": "Remove " + x.name, title: "Remove", onclick: () => remove(x) }, crossIcon())))))));
  }

  function remove(x) {
    // the keyboard stays where it was: on the Remove of the thing that moved up into this place, the one before
    // it when this was the last, or the add box when the list is now empty
    const keys = [...body.querySelectorAll("li[data-key]")].map((li) => li.dataset.key);
    const at = keys.indexOf(x.key);
    state.setShopping(removeItem(state.shopping(), x.key));
    draw();
    status.textContent = "Removed " + x.name + ".";
    const left = [...body.querySelectorAll("li[data-key] button.remove")];
    const next = left[Math.min(at, left.length - 1)];
    (next || own).focus({ preventScroll: true });
  }

  function redrawKeeping(key) {
    // after a tick the list is drawn again; put the keyboard back on the box that was ticked. What the status
    // line said was about the list before the tick ("Everything is ticked", "Copied 14"), so it is emptied.
    draw();
    status.textContent = "";
    for (const li of body.querySelectorAll("li[data-key]")) if (li.dataset.key === key) li.querySelector("input").focus({ preventScroll: true });
  }

  app.className = "";
  put(app, h("h1", {}, "Shopping"), summary,
    h("div", { class: "cols side" },
      h("div", { class: "right sticky" }, actions, askHost, status, copyHost),
      h("div", { class: "left" }, body, ownForm)));
  draw();
}
