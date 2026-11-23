// The recipe format as text boxes, and back. Pure: no page, no clock, no storage. Tested in tests/index.html.
import { slug, ingredientText, MAX_MINUTES } from "./lib.js";

export { MAX_MINUTES };
export const CHAPTERS = ["Brekky", "Basics", "Grub", "Drank", "SWEETS"];
export const JOKE = "Joke:";
const LIST_MARK = /^(\d+[.)]|[-*•])\s+/; // "1. ", "2) ", "- ": what a pasted list puts in front of each line

const UNITS = new Set(("teaspoon teaspoons tsp tablespoon tablespoons tbsp tbs cup cups oz ounce ounces lb lbs pound pounds "
  + "g gram grams kg ml l liter liters litre litres quart quarts qt pint pints pt gallon gallons clove cloves slice slices "
  + "can cans stick sticks pinch pinches dash dashes bunch bunches handful handfuls head heads sprig sprigs piece pieces "
  + "rack racks sleeve sleeves package packages pkg bag bags jar jars bottle bottles drop drops strip strips stalk stalks "
  + "shot shots splash glug glugs box boxes").split(" "));
const NUMBER = /^(\d+([.,]\d+)?|\d+\/\d+|\d*[¼-¾⅐-⅞])$/;
const RANGE = /^\d+([./]\d+)?[-–]\d+([./]\d+)?$/;
const COUNT_WORDS = new Set("one two three four five six seven eight nine ten eleven twelve".split(" "));
const LOOSE_WORDS = new Set("couple few half dozen".split(" "));

function isNumber(t) { return NUMBER.test(t) || RANGE.test(t); }
function isUnit(t) { return UNITS.has(t.toLowerCase().replace(/\.$/, "")); }

export function parseIngredientLine(line) {
  // "2 cloves garlic, smashed" -> { qty: "2", unit: "cloves", name: "garlic", note: "smashed" }
  // When the amount is not clear the whole line stays as the name, in the words it was typed in.
  const text = String(line).replace(/\s+/g, " ").trim().replace(/^[-*•]\s+/, "");
  if (text.toLowerCase().startsWith(JOKE.toLowerCase())) {
    return { qty: "", unit: "", name: text.slice(JOKE.length).trim(), note: "", aside: true };
  }
  const cut = text.indexOf(", ");
  const head = cut > 0 ? text.slice(0, cut) : text;
  const note = cut > 0 ? text.slice(cut + 2).trim() : "";
  const whole = { qty: "", unit: "", name: head, note };
  const t = head.split(" ");
  const low = (n) => (t[n] || "").toLowerCase();
  let n = 0;
  const qty = [];

  if (isNumber(low(0))) {
    qty.push(t[n++]);
    if (/^\d+$/.test(qty[0]) && /^(\d+\/\d+|[¼-¾⅐-⅞])$/.test(low(n))) qty.push(t[n++]); // 1 1/2
    else if ((low(n) === "to" || low(n) === "or") && isNumber(low(n + 1))) { qty.push(t[n], t[n + 1]); n += 2; } // 2 to 3
    if (low(n).startsWith("(")) { // 4 (ish), 1 (14 oz)
      let end = n;
      while (end < t.length && !t[end].endsWith(")")) end += 1;
      if (end < t.length - 1) { qty.push(...t.slice(n, end + 1)); n = end + 1; }
    }
  } else if (COUNT_WORDS.has(low(0))) {
    qty.push(t[n++]);
  } else if (low(0) === "a" || low(0) === "an") {
    if (LOOSE_WORDS.has(low(1))) { qty.push(t[0], t[1]); n = 2; if (low(n) === "of") qty.push(t[n++]); } // a couple, a few, a half
    else if (isUnit(low(1))) qty.push(t[n++]); // a teaspoon
    else return whole;
  } else if (LOOSE_WORDS.has(low(0)) && (low(1) === "a" || low(1) === "an")) {
    qty.push(t[0], t[1]); n = 2; // half a
  } else if (isUnit(low(0)) && low(1) === "of" && t.length > 2) {
    return { qty: "", unit: t[0] + " of", name: t.slice(2).join(" "), note }; // pinch of salt
  } else {
    return whole;
  }

  let unit = "";
  if (isUnit(low(n)) && n < t.length - 1) {
    unit = t[n++];
    if (low(n) === "of" && n < t.length - 1) unit += " " + t[n++]; // 2 cups of flour
  }
  const name = t.slice(n).join(" ");
  if (!name) return whole;
  return { qty: qty.join(" "), unit, name, note };
}

export function ingredientLine(i) {
  return (i.aside ? JOKE + " " : "") + ingredientText(i);
}

function groupsToText(groups, lineOf) {
  // one item per line; "Name:" starts a group; a lone ":" starts a group with no name
  const out = [];
  groups.forEach((g, n) => {
    if (g.section) { if (n) out.push(""); out.push(g.section + ":"); } else if (n) out.push("", ":");
    for (const item of g.items) out.push(lineOf(item));
  });
  return out.join("\n");
}

function textToGroups(text, itemOf) {
  const groups = [];
  let current = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (line.endsWith(":")) { current = { section: line.slice(0, -1).trim(), items: [] }; groups.push(current); continue; }
    if (!current) { current = { section: "", items: [] }; groups.push(current); }
    current.items.push(itemOf(line));
  }
  return groups.filter((g) => g.items.length);
}

export function parseIngredients(text, known = []) {
  // known is a list of [line, item] pairs from the recipe the draft was made from: a line he has not touched
  // keeps the item it came from, so amounts the parser would read differently survive an edit elsewhere.
  const left = known.map(([line, item]) => ({ line, item }));
  return textToGroups(text, (line) => {
    const hit = left.findIndex((k) => k.line === line);
    if (hit < 0) return parseIngredientLine(line);
    return JSON.parse(JSON.stringify(left.splice(hit, 1)[0].item));
  });
}

export function parseSteps(text) {
  // The page numbers the steps itself, so a number or bullet that came with a pasted list is taken off.
  return textToGroups(text, (line) => line.replace(LIST_MARK, "") || line);
}

function lines(text) {
  // one tip per line; a bullet that came with a pasted list is taken off, because the page adds its own
  return String(text).split(/\r?\n/).map((x) => x.replace(/\s+/g, " ").trim().replace(/^[-*•]\s+/, "")).filter(Boolean);
}

export function emptyFields() {
  return { title: "", chapter: "", hours: "", minutes: "", timeText: "", serves: "", headnote: "",
    ingredients: "", steps: "", tips: "", credit: "", tags: "" };
}

export function fieldsFromRecipe(r) {
  const total = r.total_minutes || 0;
  return {
    title: r.title || "",
    chapter: r.section || "",
    hours: total >= 60 ? String(Math.floor(total / 60)) : "",
    minutes: total % 60 ? String(total % 60) : "",
    timeText: r.time_text || "",
    serves: r.yield || "",
    headnote: r.headnote || "",
    ingredients: groupsToText(r.ingredients || [], ingredientLine),
    steps: groupsToText(r.steps || [], (s) => s),
    tips: (r.notes || []).join("\n"),
    credit: r.source || "",
    tags: (r.tags || []).join(", "),
  };
}

export function fieldsBlank(fields) {
  // true while no box holds anything: a draft like that is not worth keeping
  return Object.values(fields).every((v) => !String(v).trim());
}

function timeBox(value) {
  // one time box as a number: blank is 0, "1.5" or "1,5" is one and a half, anything else is not a number
  const t = String(value === null || value === undefined ? "" : value).trim();
  if (!t) return 0;
  return /^\d+([.,]\d+)?$/.test(t) ? Number(t.replace(",", ".")) : NaN;
}

export function timeProblem(fields) {
  // said in plain words when a time box holds something that is not a plain number (a minus sign, a word)
  return Number.isNaN(timeBox(fields.hours)) || Number.isNaN(timeBox(fields.minutes))
    ? "The time boxes take numbers only, like 1 hour 30 minutes." : "";
}

export function totalMinutes(fields) {
  // hours and minutes together, in whole minutes: 1.5 hours and 30 minutes is 120. 0 when a box is not a number.
  const hours = timeBox(fields.hours), minutes = timeBox(fields.minutes);
  return Number.isNaN(hours) || Number.isNaN(minutes) ? 0 : Math.round(hours * 60 + minutes);
}

function cleanFields(fields) {
  const out = emptyFields();
  for (const k of Object.keys(out)) if (typeof fields[k] === "string") out[k] = fields[k];
  return out;
}

function cleanOrigin(o) {
  // what a draft keeps of the recipe it was copied from; anything short of all of it and the draft stands alone
  if (!o || typeof o !== "object" || typeof o.id !== "string" || !o.id || typeof o.title !== "string") return null;
  if (!o.fields || typeof o.fields !== "object" || !Array.isArray(o.known)) return null;
  if (!Number.isInteger(o.version) || o.version < 1 || typeof o.created !== "string" || typeof o.updated !== "string") return null;
  if (!Number.isInteger(o.total_minutes) || o.total_minutes < 1) return null;
  const known = o.known.filter((k) => Array.isArray(k) && typeof k[0] === "string" && k[1] && typeof k[1] === "object" && typeof k[1].name === "string");
  return { id: o.id, title: o.title, version: o.version, created: o.created, updated: o.updated, total_minutes: o.total_minutes,
    estimated: o.estimated === true, active_minutes: Number.isInteger(o.active_minutes) && o.active_minutes > 0 ? o.active_minutes : null,
    fields: cleanFields(o.fields), known };
}

export function cleanDraft(d) {
  // A draft as read from the device, with every field made the kind the pages expect. null when it is not a draft.
  if (!d || typeof d !== "object" || typeof d.id !== "string" || !/^[a-z0-9]+$/.test(d.id)) return null;
  if (!d.fields || typeof d.fields !== "object") return null;
  const out = { id: d.id, touched: Number.isFinite(d.touched) && Math.abs(d.touched) <= 8.64e15 ? d.touched : 0,
    separate: d.separate === true, fields: cleanFields(d.fields) };
  const origin = cleanOrigin(d.origin);
  if (origin) out.origin = origin;
  return out;
}

export function draftFromRecipe(r, draftId, nowMs) {
  // "Edit a copy as a draft": the form filled from a recipe, with what the form has no box for kept beside it
  const fields = fieldsFromRecipe(r);
  const known = [];
  for (const g of r.ingredients || []) for (const i of g.items) known.push([ingredientLine(i), JSON.parse(JSON.stringify(i))]);
  return {
    id: draftId, touched: nowMs, separate: false, fields,
    origin: { id: r.id, title: r.title, version: r.version, created: r.created, updated: r.updated,
      total_minutes: r.total_minutes, estimated: r.total_minutes_estimated === true,
      active_minutes: r.active_minutes === undefined ? null : r.active_minutes,
      fields: { ...fields }, known },
  };
}

export function draftChanged(draft) {
  if (!draft.origin) return true;
  return Object.keys(draft.origin.fields).some((k) => draft.fields[k] !== draft.origin.fields[k]);
}

export function recipeFromDraft(draft, nowIso) {
  // The recipe file, with the keys in the order the files in recipes/ use. A draft made from a recipe and left
  // as it was gives that recipe back. A changed one keeps the recipe's address and goes up one version, unless
  // it was marked as a separate recipe, which gets an address from its title like a new draft does.
  const f = draft.fields, o = draft.separate ? null : draft.origin || null;
  const changed = draftChanged(draft);
  const total = totalMinutes(f);
  const out = { schema: 1 };
  out.id = o ? o.id : slug(f.title);
  out.version = o ? o.version + (changed ? 1 : 0) : 1;
  out.created = o ? o.created : nowIso;
  out.updated = o && !changed ? o.updated : nowIso;
  out.title = f.title.trim();
  if (f.chapter.trim()) out.section = f.chapter.trim();
  if (f.credit.trim()) out.source = f.credit.trim();
  if (f.headnote.trim()) out.headnote = f.headnote.trim();
  if (f.serves.trim()) out.yield = f.serves.trim();
  if (f.timeText.trim()) out.time_text = f.timeText.trim();
  out.total_minutes = total;
  const from = draft.origin || null; // a guess stays a guess, and the hands-on time stays, only while they still fit
  if (from && from.estimated && total === from.total_minutes) out.total_minutes_estimated = true;
  if (from && from.active_minutes && from.active_minutes <= total) out.active_minutes = from.active_minutes;
  out.tags = f.tags.split(",").map((x) => x.trim()).filter(Boolean);
  out.ingredients = parseIngredients(f.ingredients, from ? from.known : []);
  out.steps = parseSteps(f.steps);
  const notes = lines(f.tips);
  if (notes.length) out.notes = notes;
  return out;
}

export function draftProblems(draft) {
  // what stops a draft from being saved as finished, each in plain words; an empty list means it is ready
  const f = draft.fields, r = recipeFromDraft(draft, "");
  const out = [];
  if (!f.title.trim()) out.push("It needs a title.");
  else if (!r.id) out.push("The title needs at least one letter or number, because the recipe's address is made from it.");
  if (timeProblem(f)) out.push(timeProblem(f));
  else if (r.total_minutes <= 0) out.push("It needs a total time above zero. The start time and the calendar file are worked out from it.");
  else if (r.total_minutes > MAX_MINUTES) out.push("The total time can be two weeks at most.");
  if (!r.ingredients.some((g) => g.items.some((i) => i.name))) out.push("It needs at least one ingredient.");
  if (!r.steps.length) out.push("It needs at least one step.");
  return out;
}

export function recipeFileText(recipe) {
  // the same layout as the files in recipes/: two spaces, one key per line, a newline at the end
  return JSON.stringify(recipe, null, 2) + "\n";
}

export function recipeFileName(recipe) {
  return (recipe.id || "recipe") + ".json";
}
