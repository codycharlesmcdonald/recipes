// What is kept on this device, by name: stars, the shopping list, the meal plan, drafts, the last meal time.
// Each has its own key and format number in store.js; a value in an older or damaged format reads as empty.
// Inside a value of the right format every field is still checked on the way in (cleanPlan, cleanDraft,
// cleanList), so one wrong field never stops a page from drawing.
import { store } from "./store.js";
import { cleanPlan, realTime } from "./plan.js";
import { cleanList } from "./shopping-list.js";
import { cleanDraft } from "./recipe-format.js";

const FORMAT = { stars: 1, shopping: 1, plan: 1, drafts: 1, eatAt: 1 };

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
