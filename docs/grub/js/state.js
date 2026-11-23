// What is kept on this device, by name: stars, the shopping list, the meal plan, drafts, the last meal time,
// and his own recipes. Each has its own key and format number in store.js; a value in an older or damaged
// format reads as empty. Inside a value of the right format every field is still checked on the way in
// (cleanPlan, cleanDraft, cleanList, cleanMine), so one wrong field never stops a page from drawing.
import { store } from "./store.js";
import { cleanPlan, realTime, removeFromPlan } from "./plan.js";
import { cleanList } from "./shopping-list.js";
import { cleanDraft } from "./recipe-format.js";
import { cleanMine, withRecipe } from "./own.js";

// mine is his own recipes: a list of recipe files, newest first (see own.js). A page that finds it in a later
// format than this one leaves it alone and says to reload.
export const FORMAT = { stars: 1, shopping: 1, plan: 1, drafts: 1, eatAt: 1, mine: 1 };

const list = (x) => (Array.isArray(x) ? x : []);

// true when what is saved will still be here after the page is closed. A browser with storage switched off
// keeps things for the visit only, and the pages say so instead of "kept on this device".
export function keeping() { return store.keeps(); }
export const NOT_KEPT = "This browser is not letting the site save anything, so this lasts only until the page is closed or reloaded.";
export function keptWords(kept) { return keeping() ? kept : NOT_KEPT; }

export function stars() { return [...new Set(list(store.get("stars", FORMAT.stars, [])).filter((x) => typeof x === "string" && x))]; }
export function isStarred(id) { return stars().includes(id); }
export function setStar(id, on) {
  const rest = stars().filter((x) => x !== id);
  return store.set("stars", FORMAT.stars, on ? [id, ...rest] : rest);
}

export function shopping() { return cleanList(store.get("shopping", FORMAT.shopping, [])); }
export function setShopping(items) { return store.set("shopping", FORMAT.shopping, items); }

export function plan() { return cleanPlan(store.get("plan", FORMAT.plan, null)); }
export function setPlan(p) { return store.set("plan", FORMAT.plan, p); }

export function drafts() {
  const seen = new Set();
  return list(store.get("drafts", FORMAT.drafts, [])).map(cleanDraft)
    .filter((d) => d && !seen.has(d.id) && seen.add(d.id))
    .sort((a, b) => b.touched - a.touched);
}
export function draft(id) { return drafts().find((d) => d.id === id) || null; }
export function saveDraft(d) { return store.set("drafts", FORMAT.drafts, [d, ...drafts().filter((x) => x.id !== d.id)]); }
export function deleteDraft(id) { return store.set("drafts", FORMAT.drafts, drafts().filter((x) => x.id !== id)); }

export function eatAt() {
  const t = store.get("eatAt", FORMAT.eatAt, "18:30");
  return realTime(t) ? t : "18:30";
}
export function setEatAt(t) { return store.set("eatAt", FORMAT.eatAt, t); }

export function myRecipes() { return cleanMine(store.get("mine", FORMAT.mine, [])); }
// true when the device itself holds this recipe, not only this visit (a browser that saves nothing holds his
// recipes for the visit only, and one kept on an earlier visit comes back when the page is reloaded)
export function myRecipeOnDevice(id) { return cleanMine(store.saved("mine", FORMAT.mine, [])).some((r) => r.id === id); }
// true when his recipes were last saved by a later version of the site, in a format this page cannot read
export function myRecipesNewer() { return store.formatOf("mine") > FORMAT.mine; }

let askedToPersist = false;
function persistOnce() {
  // Asks the browser, once a visit, to keep what the site saves when it is short of room. It may say no, or
  // never answer; the pages say the same either way.
  if (askedToPersist) return;
  askedToPersist = true;
  try {
    const asked = navigator.storage && typeof navigator.storage.persist === "function" ? navigator.storage.persist() : null;
    if (asked && typeof asked.catch === "function") asked.catch(() => {});
  } catch { /* not offered here */ }
}

export function keepMyRecipe(recipe, { wanted = "", replace = "" } = {}) {
  // One read, one address, one write, so two tabs cannot give the same address. { result, id }: result is
  // "kept", "visit" (held for the visit only), "full" (no room: nothing changed), "many" (MAX_OWN already),
  // "newer" (a later format is stored, never written over) or "bad"; id is its address, "" when not added.
  if (myRecipesNewer()) return { result: "newer", id: "" };
  const next = withRecipe(myRecipes(), recipe, { wanted, replace });
  if (next.problem) return { result: next.problem, id: "" };
  const result = store.put("mine", FORMAT.mine, next.list);
  if (result === "kept") persistOnce();
  return { result, id: result === "full" ? "" : next.id };
}

export function deleteMyRecipe(id) {
  // "kept", "visit", "full" or "newer". Once it is gone, its star and its place in the meal plan go with it.
  if (myRecipesNewer()) return "newer";
  const result = store.put("mine", FORMAT.mine, myRecipes().filter((r) => r.id !== id));
  if (result === "full") return result;
  if (isStarred(id)) setStar(id, false);
  const p = plan();
  if (p.items.some((x) => x.id === id)) setPlan(removeFromPlan(p, id));
  return result;
}
