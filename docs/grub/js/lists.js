// Rows of recipes with a star on each, and the star itself. Used by Browse, Saved and the recipe page.
import { h, starIcon } from "./dom.js";
import { shortTime, chapterOf } from "./lib.js";
import { isStarred, setStar } from "./state.js";

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

export function recipeRows(list, { showChapter = false, onStar = null } = {}) {
  return h("ul", { class: "rows" }, list.map((r) => h("li", {},
    h("a", { class: "row-link", href: "#/r/" + r.id },
      h("span", { class: "t" }, r.title),
      h("span", { class: "m" }, (showChapter ? chapterOf(r) + ", " : "") + shortTime(r))),
    starButton(r, { onChange: onStar }))));
}
