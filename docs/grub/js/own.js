// A visitor's own recipes: recipes added from Draft or loaded from a recipe file, kept on their device only.
// Pure: no page, no clock, no storage. Tested in tests/index.html.
//
// Each is kept as a recipe file (the shape of recipes/<id>.json, keys in the files' order) whose id is its
// address on the device: "my--" and a plain slug, as in #/r/my--toast. tools/build.py refuses "--" in a
// cookbook id and slug() can never make one, so these addresses never meet a cookbook recipe's, now or after
// any site update. The address is given once and never changes. An optional base after notes names the
// cookbook recipe it is a version of. Nothing from a stored value or a file gets in except through
// cleanRecipe, which builds a new object from named fields only.
import { slug, haystack, minDays, MAX_MINUTES, MAX_DAYS } from "./lib.js";
import { recipeFromDraft } from "./recipe-format.js";

export const OWN_MARK = "my--";
export const MAX_OWN = 200; // recipes kept on one device
export const MAX_FILE_CHARS = 200000; // the words of one recipe file
export const MAX_FILES = 25; // files read from one pick
export const MAX_ID = 60; // the longest plain id, as in tools/build.py
// The most each part of a recipe may hold. Far above anything in the cookbook. These are part of format 1 of
// the stored value: raising one needs a new format, or an older page would drop what a newer page kept.
export const LIMITS = {
  title: 200, section: 60, source: 200, headnote: 2000, yield: 200, time_text: 200, tags: 30, tag: 60,
  groups: 30, group: 120, items: 300, qty: 60, unit: 60, name: 300, note: 300,
  stepGroups: 30, steps: 200, step: 4000, notes: 50, tip: 2000, version: 999999,
};

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/; // ID_RE in tools/build.py
const STAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const EPOCH = "1970-01-01T00:00:00Z";
const CONTROL = /[\u0000-\u001f\u007f\u2028\u2029]/g;
const CONTROL_BUT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]/g;
const DIRECTION = /[\u202a-\u202e\u2066-\u2069]/g;

export const TOO_BIG = "It is too big to be a recipe file. The most is 200,000 characters.";
export const NOT_A_FILE = "It is not a recipe file from this site.";
export const MORE_THAN_ONE = "It holds more than one recipe. Load one recipe file at a time.";
export const NEWER_FORMAT = "It is in a newer recipe format than this page knows. Reload the page and try again.";
export const NO_TITLE = "It needs a title.";
export const NO_TIME = "It needs a total time: a whole number of minutes, from 1 up to two weeks.";
export const NO_INGREDIENT = "It needs at least one ingredient.";
export const NO_STEP = "It needs at least one step.";
export const TOO_LONG = "The recipe is too long for the site to keep.";

export function isPlainId(id) {
  // a cookbook address: lower case letters and digits in runs, one hyphen between runs, 60 at most
  return typeof id === "string" && id.length <= MAX_ID && ID.test(id);
}

export function isOwnId(id) {
  // the address of one of the visitor's own recipes: "my--" and a plain id
  return typeof id === "string" && id.startsWith(OWN_MARK) && isPlainId(id.slice(OWN_MARK.length));
}

export function plainId(id) {
  // the part after "my--"; any other id unchanged
  return isOwnId(id) ? id.slice(OWN_MARK.length) : id;
}

export function freeOwnId(wanted, taken) {
  // "my--toast", then "my--toast-2", "my--toast-3": the first one not taken. The plain part stays at 60 or less.
  const stem = isPlainId(wanted) ? wanted : "recipe";
  const used = new Set(taken);
  if (!used.has(OWN_MARK + stem)) return OWN_MARK + stem;
  for (let n = 2; ; n += 1) {
    const end = "-" + n;
    const id = OWN_MARK + stem.slice(0, MAX_ID - end.length).replace(/-+$/, "") + end;
    if (!used.has(id)) return id;
  }
}

const has = (x, k) => Object.prototype.hasOwnProperty.call(x, k);
const field = (x, k) => (has(x, k) ? x[k] : undefined);
const isObject = (x) => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const whole = (n, low, high) => Number.isInteger(n) && n >= low && n <= high;

function line(v) {
  // one line of text: control characters become a space, direction marks go, the ends are trimmed
  return typeof v === "string" ? v.replace(DIRECTION, "").replace(CONTROL, " ").trim() : "";
}

function block(v) {
  // the headnote: the same, but its line breaks stay
  return typeof v === "string" ? v.replace(DIRECTION, "").replace(/\r\n?/g, "\n").replace(CONTROL_BUT_NEWLINE, " ").trim() : "";
}

const NAMES = { title: "The title", section: "The chapter", source: "The credit", headnote: "The headnote", yield: "The serves line",
  time_text: "The time in its own words", tag: "A tag", group: "A group name", qty: "An amount", unit: "A unit", name: "An ingredient",
  note: "An ingredient's note", step: "A step", tip: "A tip" };
const MANY = { tags: "tags", groups: "groups of ingredients", items: "ingredients", stepGroups: "groups of steps", steps: "steps", notes: "tips" };
const tooLong = (k) => NAMES[k] + " is too long. The most the site keeps is " + LIMITS[k].toLocaleString("en-US") + " characters.";
const tooMany = (k) => "There are too many " + MANY[k] + ". The most the site keeps is " + LIMITS[k] + ".";

export function cleanRecipe(x, nowIso) {
  // The one gate. A new recipe built from a fixed list of field names, each read as x's own property and each
  // checked for its kind, in the files' key order; or null, with the reasons in plain sentences. Something
  // wrong that can be put right without changing what the recipe says is put right without a word. Anything
  // over a limit is refused, never cut short. pdf, own, _words and any other key are never copied.
  if (!isObject(x)) return { recipe: null, problems: [NOT_A_FILE] };
  const problems = [];
  const said = new Set();
  const say = (text) => { if (!said.has(text)) { said.add(text); problems.push(text); } };
  const short = (k, text) => { if (text.length > LIMITS[k]) say(tooLong(k)); return text; };
  const stamp = (v) => (typeof v === "string" && STAMP.test(v) && !Number.isNaN(Date.parse(v)) ? v : nowIso);

  if (has(x, "schema") && x.schema !== 1) return { recipe: null, problems: [Number.isInteger(x.schema) && x.schema > 1 ? NEWER_FORMAT : NOT_A_FILE] };
  const out = { schema: 1 };
  out.id = isOwnId(field(x, "id")) ? x.id : "";
  out.version = whole(field(x, "version"), 1, LIMITS.version) ? x.version : 1;
  out.created = stamp(field(x, "created"));
  out.updated = stamp(field(x, "updated"));
  out.title = short("title", line(field(x, "title")));
  if (!out.title) say(NO_TITLE);
  for (const k of ["section", "source", "headnote", "yield", "time_text"]) {
    const text = short(k, k === "headnote" ? block(field(x, k)) : line(field(x, k)));
    if (text) out[k] = text;
  }
  const total = field(x, "total_minutes");
  if (whole(total, 1, MAX_MINUTES)) out.total_minutes = total; else { out.total_minutes = 0; say(NO_TIME); }
  if (field(x, "total_minutes_estimated") === true) out.total_minutes_estimated = true;
  const active = field(x, "active_minutes");
  if (out.total_minutes && whole(active, 1, out.total_minutes)) out.active_minutes = active;
  const given = field(x, "days");
  const days = Math.max(whole(given, 2, MAX_DAYS) ? given : 1, minDays(out.total_minutes));
  if (days > 1) out.days = days;

  const tags = Array.isArray(field(x, "tags")) ? x.tags.map(line).filter(Boolean) : [];
  if (tags.length > LIMITS.tags) say(tooMany("tags"));
  out.tags = tags.map((t) => short("tag", t));

  const groups = Array.isArray(field(x, "ingredients")) ? x.ingredients : [];
  out.ingredients = [];
  let items = 0;
  for (const g of groups) {
    if (!isObject(g) || !Array.isArray(field(g, "items"))) continue;
    const kept = [];
    for (const i of g.items) {
      if (!isObject(i)) continue;
      const name = short("name", line(field(i, "name")));
      if (!name) continue;
      const item = { qty: short("qty", line(field(i, "qty"))), unit: short("unit", line(field(i, "unit"))), name, note: short("note", line(field(i, "note"))) };
      if (field(i, "aside") === true) item.aside = true;
      kept.push(item);
    }
    if (!kept.length) continue;
    items += kept.length;
    out.ingredients.push({ section: short("group", line(field(g, "section"))), items: kept });
  }
  if (!out.ingredients.length) say(NO_INGREDIENT); // a joke line counts, as it does in Draft and in tools/build.py
  if (out.ingredients.length > LIMITS.groups) say(tooMany("groups"));
  if (items > LIMITS.items) say(tooMany("items"));

  out.steps = [];
  let steps = 0;
  for (const g of Array.isArray(field(x, "steps")) ? x.steps : []) {
    if (!isObject(g) || !Array.isArray(field(g, "items"))) continue;
    const kept = g.items.map(line).filter(Boolean).map((s) => short("step", s));
    if (!kept.length) continue;
    steps += kept.length;
    out.steps.push({ section: short("group", line(field(g, "section"))), items: kept });
  }
  if (!out.steps.length) say(NO_STEP);
  if (out.steps.length > LIMITS.stepGroups) say(tooMany("stepGroups"));
  if (steps > LIMITS.steps) say(tooMany("steps"));

  const notes = Array.isArray(field(x, "notes")) ? x.notes.map(line).filter(Boolean).map((t) => short("tip", t)) : [];
  if (notes.length > LIMITS.notes) say(tooMany("notes"));
  if (notes.length) out.notes = notes;
  if (isPlainId(field(x, "base"))) out.base = x.base;
  // Measured in the longest form it can take: kept on the device at the longest address, with the longest base.
  // Whatever passes here still fits once it is kept, wherever it is kept, and its recipe file loads back.
  if (!problems.length && JSON.stringify({ ...out, id: OWN_MARK + "x".repeat(MAX_ID), base: "x".repeat(MAX_ID) }, null, 2).length + 1 > MAX_FILE_CHARS) say(TOO_LONG);
  return problems.length ? { recipe: null, problems } : { recipe: out, problems };
}

export function cleanMine(list) {
  // The stored list as the pages may use it: every entry through cleanRecipe, kept only with an address of
  // its own, each address once (the first wins), at most MAX_OWN. A damaged entry is dropped and the rest stay.
  const seen = new Set(), out = [];
  for (const x of Array.isArray(list) ? list : []) {
    const { recipe } = cleanRecipe(x, EPOCH);
    if (!recipe || !recipe.id || seen.has(recipe.id)) continue;
    seen.add(recipe.id);
    out.push(recipe);
    if (out.length === MAX_OWN) break;
  }
  return out;
}

const WORDS = ["title", "section", "source", "headnote", "yield", "time_text", "total_minutes", "total_minutes_estimated", "active_minutes", "days",
  "tags", "ingredients", "steps", "notes"];

export function wordsKey(r) {
  // everything a reader of the recipe sees, as one text; null when it is not a recipe. The address, version,
  // dates and base do not count, and a field left out reads the same as an empty one.
  const { recipe } = cleanRecipe(r, EPOCH);
  return recipe ? JSON.stringify(WORDS.map((k) => (k in recipe ? recipe[k] : null))) : null;
}

export function sameWords(a, b) {
  const key = wordsKey(a);
  return key !== null && key === wordsKey(b);
}

export function sameWordsIn(r, list) {
  // the first recipe in list that reads word for word like r, whatever its address; null when there is none
  const key = wordsKey(r);
  return key === null ? null : list.find((x) => wordsKey(x) === key) || null;
}

export function twinOf(r, book) {
  // the cookbook recipe one of the visitor's recipes stands beside: its base, or the plain part of its address
  const id = r.base || plainId(r.id);
  return book.find((b) => b.id === id) || null;
}

export function recipeFileOf(r) {
  // The recipe file of one of the visitor's recipes: the id is its base, else the plain part of its address,
  // and base, own, _words and pdf are left out. It is a file tools/build.py takes into recipes/ as it is.
  const out = {};
  for (const [k, v] of Object.entries(r)) if (!["base", "own", "_words", "pdf"].includes(k)) out[k] = v;
  out.id = r.base || plainId(r.id);
  return out;
}

export function readRecipeFile(text, nowIso) {
  // The words of a recipe file, loaded or pasted: { recipe, wanted, problems }. recipe is null when it cannot
  // be used, and problems says why. The id in a file is never used as an address: wanted is the plain id the
  // device address is made from (the file's id, else the title's slug). Never throws.
  const refused = (said) => ({ recipe: null, wanted: "", problems: [said] });
  if (typeof text !== "string" || text.length > MAX_FILE_CHARS) return refused(TOO_BIG);
  let x;
  try { x = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { return refused(NOT_A_FILE); }
  if (Array.isArray(x) || (isObject(x) && Array.isArray(field(x, "recipes")))) return refused(MORE_THAN_ONE);
  const { recipe, problems } = cleanRecipe(x, nowIso);
  if (!recipe) return { recipe: null, wanted: "", problems };
  delete recipe.base;
  recipe.id = "";
  const id = field(x, "id");
  const wanted = isPlainId(id) ? id : isOwnId(id) ? plainId(id) : slug(recipe.title) || "recipe";
  return { recipe, wanted, problems: [] };
}

export function withRecipe(all, recipe, { wanted = "", replace = "" } = {}) {
  // The stored list with one recipe added or put in place: { list, id }, or { problem } ("many": the device
  // holds MAX_OWN already; "bad": it is not a recipe). replace is the address of the recipe it takes the place
  // of, where it stays in the list; a new one gets the first free address made from wanted, at the top.
  const at = isOwnId(replace) ? all.findIndex((r) => r.id === replace) : -1;
  const id = isOwnId(replace) ? replace : freeOwnId(wanted, all.map((r) => r.id));
  if (at < 0 && all.length >= MAX_OWN) return { problem: "many" };
  const { recipe: clean } = cleanRecipe(isObject(recipe) ? { ...recipe, id } : null, EPOCH);
  if (!clean) return { problem: "bad" };
  return { list: at < 0 ? [clean, ...all] : all.map((r, n) => (n === at ? clean : r)), id };
}

export function ownFromDraft(draft, nowIso, book, mine) {
  // What Add to your recipes keeps from a draft: { recipe, wanted, replace, editing, stored }.
  // A draft opened from one of the visitor's recipes (and not marked separate) replaces it at its address, one
  // version past the later of the stored one and the one it was made from. A copy of a cookbook recipe wants
  // the cookbook's id and is one version past the cookbook's. A new draft or a separate one wants the title's
  // slug. base is the cookbook id when the cookbook has the id wanted.
  const o = draft.origin && !draft.separate ? draft.origin : null;
  const editing = Boolean(o) && isOwnId(o.id);
  const stored = editing ? mine.find((r) => r.id === o.id) || null : null;
  const from = o && !editing ? book.find((r) => r.id === o.id) || null : null;
  const recipe = recipeFromDraft(draft, nowIso, stored ? stored.version : from ? from.version : 0);
  const wanted = editing ? plainId(o.id) : recipe.id;
  const base = editing && stored ? stored.base : book.some((r) => r.id === wanted) ? wanted : "";
  if (base) recipe.base = base;
  return { recipe, wanted, replace: editing ? o.id : "", editing, stored };
}

export function joinData(book, mine) {
  // The cookbook and the visitor's recipes as one fresh list for the pages: the cookbook's recipes first, the
  // very same objects in the build's order, then the visitor's by title, each a new object with own: true and
  // the words search reads (its own, and "yours"). Neither list given is changed. An id is never there twice.
  // This is the one place the lists meet. A shared store later would be a third list handed in here.
  const seen = new Set(), cookbook = [];
  for (const r of book.recipes) { if (isOwnId(r.id) || seen.has(r.id)) continue; seen.add(r.id); cookbook.push(r); }
  const own = (Array.isArray(mine) ? mine : []).filter((r) => r && isOwnId(r.id) && !seen.has(r.id) && seen.add(r.id))
    .map((r) => ({ ...r, own: true, _words: haystack(r).concat("yours") }))
    .sort((a, b) => { const x = a.title.toLowerCase(), y = b.title.toLowerCase(); return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : 1; });
  return { sections: book.sections, book: cookbook, recipes: cookbook.concat(own) };
}
