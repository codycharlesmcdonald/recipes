// Saved: the starred recipes, newest star first. Kept on this device.
import { h, statusLine } from "../dom.js";
import { countText } from "../lib.js";
import { recipeRows } from "../lists.js";
import * as state from "../state.js";
import { SITE_TITLE } from "./home.js";

export function saved(app, data) {
  document.title = "Saved | " + SITE_TITLE;
  const count = h("p", { class: "count quiet small" });
  const status = statusLine();
  const list = state.stars().map((id) => data.recipes.find((r) => r.id === id)).filter(Boolean);

  function say() {
    const n = state.stars().filter((id) => data.recipes.some((r) => r.id === id)).length;
    count.textContent = countText(n, "recipe", "recipes") + ". " + state.keptWords("Kept on this device.");
  }

  // A star pressed by mistake must be easy to put back: the row stays where it is, with a hollow star, until
  // the page is left. The count and one plain line say what happened.
  const rows = recipeRows(list, { showChapter: true, onStar: (on, r) => {
    say();
    status.textContent = on ? "Put " + r.title + " back on Saved." : "Took " + r.title + " off Saved. Press its star again to put it back.";
  } });

  app.className = "";
  if (!list.length) {
    app.replaceChildren(h("h1", {}, "Saved"), h("div", { class: "narrow" },
      h("p", { class: "empty" }, "Nothing saved yet. Press the star on a recipe and it shows up here."),
      h("p", {}, h("a", { href: "#/browse" }, "Browse the recipes"))));
    return;
  }
  app.replaceChildren(h("h1", {}, "Saved"), h("div", { class: "narrow" }, count, status, rows));
  say();
}
