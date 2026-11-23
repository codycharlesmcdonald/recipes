// Rows of recipes with a star on each, and the star itself. Used by Browse, Saved and the recipe page.
import { h, starIcon } from "./dom.js";
import { shortTime, chapterOf } from "./lib.js";
import { isStarred, setStar } from "./state.js";
import { daysMark, ownMark } from "./recipe-view.js";

export function starButton(r, { withText = false, onChange = null } = {}) {
  const text = withText ? h("span", {}, "") : null;
  const b = h("button", { type: "button", class: withText ? "star with-text" : "star", "aria-label": "Save " + r.title, title: "Save" }, starIcon(), text);
  const show = (on) => {
    b.setAttribute("aria-pressed", String(on));
    b.title = on ? "Saved. Press to take it off Saved." : "Save";
    if (text) text.textContent = on ? "Saved" : "Save";
  };
  show(isStarred(r.id));
  b.addEventListener("click", () => {
    const on = b.getAttribute("aria-pressed") !== "true";
    setStar(r.id, on);
    show(on);
    if (onChange) onChange(on, r);
  });
  return b;
}

// mark: false leaves out the Yours mark, for a list where every row is his own (Draft's Your recipes)
export function recipeRows(list, { showChapter = false, onStar = null, mark = true } = {}) {
  return h("ul", { class: "rows" }, list.map((r) => h("li", {},
    h("a", { class: "row-link", href: "#/r/" + r.id },
      h("span", { class: "t" }, r.title),
      // the time, and beside it the tag of a recipe that needs more than one day, so it is seen before the recipe is chosen
      h("span", { class: "m" }, h("span", { class: "time" }, (showChapter ? chapterOf(r) + ", " : "") + shortTime(r)),
        // the comma is heard, not drawn; one of his own recipes says so the same way
        [daysMark(r), mark ? ownMark(r) : null].filter(Boolean).map((m) => [h("span", { class: "offscreen" }, ", "), m]))),
    starButton(r, { onChange: onStar }))));
}
