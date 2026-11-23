// Browse: every recipe by chapter, with the search box and two ways to narrow (chapter, time).
// What is picked lives in the address (#/browse?chapter=Grub&q=peanut&time=30) and nowhere else, so Back and a
// reload come back to the same list, and the plain Browse link always shows every recipe.
import { h, put } from "../dom.js";
import { narrow, chapterList, chapterOf, countText, browseState, browseHash, BROWSE_TIMES } from "../lib.js";
import { recipeRows } from "../lists.js";
import { SITE_TITLE } from "./home.js";

export function browse(app, data, route) {
  document.title = "Browse | " + SITE_TITLE;
  const chapters = chapterList(data.sections, data.recipes);
  const picked = browseState(route.query, chapters);

  const results = h("div", { class: "results" });
  const count = h("p", { class: "count quiet small", role: "status" });
  const input = h("input", { class: "search", id: "search", type: "search", placeholder: "Name or ingredient",
    autocomplete: "off", autocapitalize: "off", spellcheck: "false", value: picked.query,
    oninput: (e) => { picked.query = e.target.value; changed(); } });

  const chip = (label, isOn, choose) => {
    const b = h("button", { type: "button", class: "chip", onclick: () => { choose(); changed(); } }, label);
    b._isOn = isOn;
    return b;
  };
  const chapterChips = [chip("All", () => !picked.chapter, () => { picked.chapter = ""; })]
    .concat(chapters.map((c) => chip(c, () => picked.chapter === c, () => { picked.chapter = picked.chapter === c ? "" : c; })));
  const timeChips = BROWSE_TIMES.map(([n, label]) => chip(label, () => picked.maxMinutes === n, () => { picked.maxMinutes = picked.maxMinutes === n ? 0 : n; }));

  function changed() {
    // the address follows what is picked, without adding a step to Back for every letter typed
    try { history.replaceState(null, "", browseHash(picked)); app.dataset.hash = location.hash; } catch { /* the list still narrows */ }
    draw();
  }

  function draw() {
    for (const b of chapterChips.concat(timeChips)) b.setAttribute("aria-pressed", String(b._isOn()));
    const found = narrow(data.recipes, picked);
    const narrowed = Boolean(picked.query.trim() || picked.chapter || picked.maxMinutes);
    count.textContent = countText(found.length, "recipe", "recipes") + (narrowed ? " of " + data.recipes.length : "");
    results.replaceChildren();
    if (!found.length) {
      const onlyChapter = picked.chapter && !picked.query.trim() && !picked.maxMinutes;
      results.append(h("p", { class: "empty" }, onlyChapter ? "Nothing in " + picked.chapter + " yet."
        : "Nothing matches that. Try one word, like an ingredient, or take a filter off."));
      return;
    }
    for (const c of chapters) {
      const list = found.filter((r) => chapterOf(r) === c);
      if (list.length) results.append(h("h2", {}, c), recipeRows(list));
    }
  }

  app.className = "";
  put(app,
    h("h1", {}, "Browse"),
    h("div", { class: "cols rail" },
      h("div", { class: "left sticky" },
        h("label", { class: "field", for: "search" }, h("span", {}, "Search"), input),
        h("div", { class: "filter", role: "group", "aria-label": "Chapter" }, h("span", { class: "filter-name" }, "Chapter"), h("div", { class: "chips" }, chapterChips)),
        h("div", { class: "filter", role: "group", "aria-label": "Time" }, h("span", { class: "filter-name" }, "Time"), h("div", { class: "chips" }, timeChips)),
        count),
      h("div", { class: "right" }, results)));
  draw();
}
