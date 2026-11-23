// How a recipe is drawn. The recipe page and the Draft preview both use this, so a draft looks like its page will.
// In the preview (preview: true) the same things are drawn one heading level down, because the Draft page has its
// own top heading, and the tick boxes are pictures of boxes, not controls, so Tab does not stop on them.
import { h } from "./dom.js";
import { timeFacts, SITE_TITLE } from "./lib.js";

export function recipeHead(r, { preview = false } = {}) {
  const facts = timeFacts(r);
  const meta = [facts.ready];
  if (r.yield) meta.push(/^(serves|makes)/i.test(r.yield) ? r.yield : "Serves " + r.yield);
  if (r.source) meta.push("Credit: " + r.source);
  return [
    preview
      ? (r.section ? h("p", { class: "kicker" }, r.section) : null)
      : h("p", { class: "kicker" }, h("a", { href: "#/browse" }, "Browse"),
        r.section ? [h("span", { class: "sep", "aria-hidden": "true" }, "/"), h("a", { href: "#/browse?chapter=" + encodeURIComponent(r.section) }, r.section)] : null),
    preview ? null : h("p", { class: "print-only book-line" }, SITE_TITLE + (r.section ? ", " + r.section : "")), // on paper, where the top row is not printed
    h(preview ? "h2" : "h1", { class: "t1 recipe-title" }, r.title || "Untitled recipe"),
    r.headnote ? h("p", { class: "headnote" }, r.headnote) : null,
    h("p", { class: "meta" }, meta.map((m) => h("span", {}, m + (/[.!?]$/.test(m) ? " " : ". ")))),
    facts.guess ? h("p", { class: "guess small quiet" }, facts.guess) : null,
  ];
}

function amount(i) {
  return [i.qty, i.unit].filter(Boolean).join(" ");
}

export function recipeColumns(r, { preview = false, besideSteps = null } = {}) {
  const head = preview ? "h3" : "h2", group = preview ? "h4" : "h3";
  const line = (i) => h("span", {}, amount(i) ? h("span", { class: "q" }, amount(i) + " ") : null, i.name,
    i.note ? h("span", { class: "n" }, ", " + i.note) : null);
  const ingredients = h("section", { class: "ingredients" }, h(head, { class: "t2" }, "Ingredients"),
    r.ingredients.length ? null : h("p", { class: "quiet" }, "No ingredients yet."),
    r.ingredients.map((g) => [
      g.section ? h(group, { class: "t3" }, g.section) : null,
      h("ul", { class: "ing" }, g.items.map((i) => (i.aside
        ? h("li", { class: "aside" }, i.name)
        : h("li", {}, preview
          ? h("span", { class: "ing-line" }, h("span", { class: "box", "aria-hidden": "true" }), line(i))
          : h("label", { class: "ing-line" }, h("input", { type: "checkbox" }), line(i)))))),
    ]));

  const stepsHead = h(head, { class: "t2" }, "Steps");
  const steps = h("section", { class: "method" },
    besideSteps ? h("div", { class: "steps-head" }, stepsHead, besideSteps) : stepsHead,
    r.steps.length ? null : h("p", { class: "quiet" }, "No steps yet."),
    r.steps.map((g) => [
      g.section ? h(group, { class: "t3" }, g.section) : null,
      h("ol", { class: "steps" }, g.items.map((s) => h("li", {}, s))),
    ]),
    r.notes && r.notes.length ? [h(head, { class: "t2" }, "Tips"), h("ul", { class: "tips" }, r.notes.map((n) => h("li", {}, n)))] : null);

  return h("div", { class: "cols" }, h("div", { class: "left" }, ingredients), h("div", { class: "right" }, steps));
}
