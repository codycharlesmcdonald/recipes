// Home: the five doors, set like a cookbook's contents page, with the chapters and what is in them beside the doors.
import { h, put } from "../dom.js";
import { countText, chapterList, chapterOf, SITE_TITLE } from "../lib.js";
import { counts } from "../shopping-list.js";
import { ownMark } from "../recipe-view.js";
import * as state from "../state.js";

export { SITE_TITLE };

export function home(app, data) {
  document.title = SITE_TITLE;
  const here = (id) => data.recipes.some((r) => r.id === id);
  const nDrafts = state.drafts().length;
  const toGet = counts(state.shopping()).toGet;
  const planned = state.plan().items.filter((x) => here(x.id)).length;
  const saved = state.stars().filter(here).length;

  const doors = [
    ["Draft", "#/draft", "Write a recipe in the cookbook's format and add it to your recipes.", nDrafts ? countText(nDrafts, "draft", "drafts") : "No drafts"],
    ["Shopping", "#/shopping", "One running list. Add to it from any recipe.", toGet ? toGet + " to get" : "Nothing to get"],
    ["Prep", "#/prep", "Pick what you're cooking and when you eat. Get the start times and a calendar file.", planned ? planned + " planned" : "Nothing planned"],
    ["Saved", "#/saved", "The recipes you starred.", saved ? saved + " saved" : "None saved"],
    ["Browse", "#/browse", "Every recipe, by chapter, with search.", countText(data.recipes.length, "recipe", "recipes")],
  ];
  const row = ([name, href, what, count]) => h("li", {}, h("a", { href },
    h("span", { class: "door-name" }, name), h("span", { class: "leader", "aria-hidden": "true" }), h("span", { class: "door-count" }, count),
    h("span", { class: "door-what" }, what)));

  // the contents: each chapter leads into Browse narrowed to it, and each recipe under it leads to its page
  const chapterRows = chapterList(data.sections, data.recipes).map((c) => {
    const list = data.recipes.filter((r) => chapterOf(r) === c);
    return h("li", {},
      h("a", { class: "chapter", href: "#/browse?chapter=" + encodeURIComponent(c) },
        h("span", { class: "chapter-name" }, c), h("span", { class: "leader", "aria-hidden": "true" }),
        h("span", { class: "door-count" }, list.length ? countText(list.length, "recipe", "recipes") : "Nothing yet")),
      list.length ? h("ul", { class: "titles" }, list.map((r) => h("li", {}, h("a", { href: "#/r/" + r.id }, r.title,
        ownMark(r) ? [h("span", { class: "offscreen" }, ", "), ownMark(r)] : null)))) : null);
  });

  app.className = "home";
  put(app, h("div", { class: "home-grid" },
    h("div", { class: "home-title" },
      h("h1", { class: "hello" }, SITE_TITLE),
      // the cookbook's count, and his own beside it when he has any
      h("p", { class: "lede" }, countText(data.book.length, "recipe", "recipes") + " so far"
        + (data.recipes.length > data.book.length ? ", and " + (data.recipes.length - data.book.length) + " of your own" : "") + ".")),
    h("ol", { class: "doors" }, doors.map(row)),
    h("div", { class: "home-chapters" },
      h("h2", { class: "chapters-title" }, "Chapters"),
      h("ul", { class: "chapters" }, chapterRows))));
}
