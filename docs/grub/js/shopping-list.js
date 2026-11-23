// The running shopping list as plain data. Pure: every function takes a list and returns a new one.
// An item is { key, recipeId, recipeTitle, name, qty, unit, got }. recipeId is "" for something he typed in.
import { fold, nameKey, amountText, mergedLines } from "./lib.js";

export const OWN_TITLE = "Your own";

function keyOf(recipeId, i) {
  return (recipeId || "own") + "|" + nameKey(i.name) + "|" + fold(amountText(i));
}

export function cleanList(list) {
  // what was read from the device, with anything that is not a shopping item left out and every field the right kind
  const text = (v) => (typeof v === "string" ? v : "");
  const seen = new Set(), out = [];
  for (const x of Array.isArray(list) ? list : []) {
    if (!x || typeof x.key !== "string" || typeof x.name !== "string" || !x.name.trim() || seen.has(x.key)) continue;
    seen.add(x.key);
    out.push({ key: x.key, recipeId: text(x.recipeId), recipeTitle: text(x.recipeTitle), name: x.name, qty: text(x.qty), unit: text(x.unit), got: x.got === true });
  }
  return out;
}

export function realIngredients(recipe) {
  // what the picker offers: every ingredient that is a thing to buy; joke lines are never offered
  return recipe.ingredients.flatMap((g) => g.items).filter((i) => !i.aside);
}

function add(list, recipeId, recipeTitle, items) {
  const out = list.map((x) => ({ ...x }));
  let added = 0, already = 0;
  for (const i of items) {
    const key = keyOf(recipeId, i);
    const there = out.find((x) => x.key === key);
    if (there) { there.got = false; already += 1; continue; } // asked for again, so it is back on the to-get side
    out.push({ key, recipeId, recipeTitle, name: String(i.name).trim(), qty: i.qty || "", unit: i.unit || "", got: false });
    added += 1;
  }
  return { list: out, added, already };
}

export function addFromRecipe(list, recipe, items) {
  return add(list, recipe.id, recipe.title, items);
}

export function addOwn(list, text) {
  const name = String(text).replace(/\s+/g, " ").trim();
  if (!name) return { list, added: 0, already: 0 };
  return add(list, "", OWN_TITLE, [{ name, qty: "", unit: "" }]);
}

export function setGot(list, key, got) {
  return list.map((x) => (x.key === key ? { ...x, got } : x));
}

export function removeItem(list, key) {
  return list.filter((x) => x.key !== key);
}

export function clearTicked(list) {
  return list.filter((x) => !x.got);
}

export function counts(list) {
  const got = list.filter((x) => x.got).length;
  return { toGet: list.length - got, got };
}

export function groups(list) {
  // by recipe in the order each first appeared, with his own items last
  const out = [];
  for (const x of list) {
    let g = out.find((y) => y.recipeId === x.recipeId);
    if (!g) { g = { recipeId: x.recipeId, title: x.recipeId ? x.recipeTitle : OWN_TITLE, items: [] }; out.push(g); }
    g.items.push(x);
  }
  return out.filter((g) => g.recipeId).concat(out.filter((g) => !g.recipeId));
}

export function sendLines(list) {
  // what goes to Reminders or the clipboard: the things not yet ticked, the same thing from two recipes once
  return mergedLines(list.filter((x) => !x.got));
}
