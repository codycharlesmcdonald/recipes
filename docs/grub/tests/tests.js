import { fold, slug, haystack, matches, minutesText, countText, chapterList, narrow, timeFacts, shortTime, ingredientText, amountText,
  mergedLines, shoppingLine, isoStamp, buildIcs, buildPlanIcs, icsFileName, planFileName,
  parseRoute, nameKey, browseState, browseHash, pdfHref, MAX_MINUTES,
  daysOf, daysLabel, minDays, timePicked, timeChoice, BROWSE_TIMES, MAX_DAYS, totalText } from "../js/lib.js";
import * as lib from "../js/lib.js";
import { parseIngredientLine, ingredientLine, parseIngredients, parseSteps, parseTips, emptyFields, fieldsFromRecipe, totalMinutes, timeProblem, fieldsBlank,
  draftFromRecipe, draftChanged, nothingToKeep, recipeFromDraft, draftProblems, recipeFileText, recipeFileName, cleanDraft,
  daysFromField, daysField, daysWords, daysProblem } from "../js/recipe-format.js";
import { addFromRecipe, addOwn, setGot, removeItem, clearTicked, counts, groups, copyLines, realIngredients, cleanList, OWN_TITLE } from "../js/shopping-list.js";
import { emptyPlan, addToPlan, removeFromPlan, setPlanMinutes, usableMinutes, realTime, cleanPlan, planEntries, longestMinutes, planLines, startWhen,
  mealMsOf, dateValue, defaultDay, planDay } from "../js/plan.js";
import { makeStore, PREFIX } from "../js/store.js";
import * as own from "../js/own.js";
import { localOnly } from "./local-only.js";

const lines = [];
let failed = 0;
function say(line) {
  // every line goes onto the page as it is made, so a run that stops part-way shows how far it got
  lines.push(line);
  document.getElementById("out").textContent = lines.join("\n");
}
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed += 1;
  say((ok ? "ok   " : "FAIL ") + name + (ok ? "" : "\n     got  " + JSON.stringify(got) + "\n     want " + JSON.stringify(want)));
}

check("fold accents", fold("Piña Colada"), "pina colada");
check("fold apostrophes", fold("Tosh’s 'Ritos & more"), "toshs ritos more");
check("minutes under an hour", minutesText(20), "20 minutes");
check("one hour", minutesText(60), "1 hour");
check("hours and minutes", minutesText(205), "3 hours 25 minutes");
check("a day", minutesText(1440), "1 day");
check("25 hours", minutesText(1500), "1 day 1 hour");

const r = { title: "Pad Thai, Baby", section: "Grub", tags: ["noodles", "thai"], ingredients: [{ section: "", items: [
  { qty: "2", unit: "cloves", name: "garlic", note: "" }, { qty: "", unit: "", name: "12 drummers drumming", note: "", aside: true },
  { qty: "A half", unit: "cup", name: "peanut butter", note: "" }] }] };
const words = haystack(r);
check("search title prefix", matches(words, "pad th"), true);
check("search ingredient", matches(words, "peanut"), true);
check("search two words any order", matches(words, "butter pad"), true);
check("search section", matches(words, "grub"), true);
check("search skips joke lines", matches(words, "drummers"), false);
check("search miss", matches(words, "chicken"), false);
check("empty search matches", matches(words, "  "), true);

check("ingredient text", ingredientText({ qty: "2", unit: "cloves", name: "garlic", note: "smashed" }), "2 cloves garlic, smashed");
check("ingredient no amount", ingredientText({ qty: "", unit: "", name: "ice", note: "" }), "ice");
check("shopping line", shoppingLine({ qty: "2", unit: "cloves", name: "garlic", note: "smashed" }), "Garlic (2 cloves)");
check("shopping line bare", shoppingLine({ qty: "", unit: "", name: "sriracha", note: "x" }), "Sriracha");

// first vector: 50 minutes, eating 2026-11-27 02:30 UTC, made 2026-11-22 23:00 UTC, alert 10 minutes before
const v1 = buildIcs({ id: "sample-skillet-lemon-chicken", title: "Skillet Lemon Chicken Thighs", totalMinutes: 50,
  mealMs: Date.UTC(2026, 10, 27, 2, 30), nowMs: Date.UTC(2026, 10, 22, 23, 0), alarmMinutes: 10, siteUrl: "https://pantsonmyhead.com/" });
check("ics vector 1", v1.split("\r\n"), [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//pantsonmyhead.com//Recipes 1//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
  "UID:sample-skillet-lemon-chicken-20261127T023000Z@pantsonmyhead.com", "DTSTAMP:20261122T230000Z",
  "DTSTART:20261127T014000Z", "DTEND:20261127T023000Z", "SUMMARY:Cook: Skillet Lemon Chicken Thighs",
  "DESCRIPTION:50 minutes start to finish. The meal is at the end of this even",
  " t.\\nhttps://pantsonmyhead.com/#/r/sample-skillet-lemon-chicken",
  "URL:https://pantsonmyhead.com/#/r/sample-skillet-lemon-chicken",
  "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Start cooking: Skillet Lemon Chicken Thighs", "TRIGGER:-PT10M", "END:VALARM",
  "END:VEVENT", "END:VCALENDAR", ""]);

// second vector: escaping, non-ASCII, folding, no alarm
const v2 = buildIcs({ id: "moms-pate-brisee", title: "Mom’s pâté brisée; butter, flour \\ water (the long, slow, two-day version for a crowd)",
  totalMinutes: 1500, mealMs: Date.UTC(2026, 11, 25, 1, 0), nowMs: Date.UTC(2026, 10, 22, 23, 0), alarmMinutes: null, siteUrl: "https://pantsonmyhead.com/" });
const l2 = v2.split("\r\n");
check("ics vector 2 summary", l2.slice(9, 11), ["SUMMARY:Cook: Mom’s pâté brisée\\; butter\\, flour \\\\ water (the long\\, ", " slow\\, two-day version for a crowd)"]);
check("ics vector 2 start", l2[7], "DTSTART:20261224T000000Z");
check("ics vector 2 end", l2[8], "DTEND:20261225T010000Z");
check("ics vector 2 no alarm", v2.includes("VALARM"), false);
check("ics every line within 75 octets", v2.split("\r\n").every((x) => new TextEncoder().encode(x).length <= 75), true);
check("ics alarm at start", buildIcs({ id: "a", title: "A", totalMinutes: 5, mealMs: 0, nowMs: 0, alarmMinutes: 0, siteUrl: "https://x/" }).includes("TRIGGER:PT0M"), true);
check("ics file name", icsFileName("Tosh’s Super Dank Veggie Pizza!"), "Cook Toshs Super Dank Veggie Pizza.ics");

// the real data file loads and every recipe has what the pages need
const data = await fetch("../data/recipes.json").then((x) => x.json());
check("data has recipes", data.recipes.length > 0, true);
check("every recipe has a whole total_minutes above zero", data.recipes.every((x) => Number.isInteger(x.total_minutes) && x.total_minutes > 0), true);
check("every recipe has ingredients and steps", data.recipes.every((x) => x.ingredients.length && x.steps.length && x.steps.every((g) => g.items.length)), true);
check("ids are unique", new Set(data.recipes.map((x) => x.id)).size, data.recipes.length);

/* ---------- second version ---------- */

// the address of a recipe
check("slug ampersand as and", slug("Larp Chicken & Sticky Rice"), "larp-chicken-and-sticky-rice");
check("slug accents off", slug("Piña Colada"), "pina-colada");
check("slug apostrophes dropped", slug("Tosh’s 'Ritos & more!"), "toshs-ritos-and-more");
check("slug runs to one hyphen, ends trimmed", slug("  Pad Thai,   Baby  "), "pad-thai-baby");
check("slug of only symbols is empty", slug("!!! ???"), "");
check("slug stops at 60 with no hyphen at the end", slug("a".repeat(59) + " bcd"), "a".repeat(59));
check("slug matches the ids in use (the spring rolls were named by hand)",
  data.recipes.filter((x) => slug(x.title) !== x.id).map((x) => x.id), ["spring-rolls"]);

// the several-event calendar file: Pad Thai (1 hour) and Larp (1 day), eating 2026-11-30 02:30 UTC
const plan2 = buildPlanIcs({ events: [{ id: "pad-thai-baby", title: "Pad Thai, Baby", totalMinutes: 60 },
  { id: "larp-chicken-and-sticky-rice", title: "Larp Chicken & Sticky Rice", totalMinutes: 1440 }],
mealMs: Date.UTC(2026, 10, 30, 2, 30), nowMs: Date.UTC(2026, 10, 22, 23, 0), alarmMinutes: 10, siteUrl: "https://pantsonmyhead.com/grub/" });
check("plan ics, two events, earliest start first", plan2.split("\r\n"), [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//pantsonmyhead.com//Recipes 1//EN", "CALSCALE:GREGORIAN",
  "BEGIN:VEVENT", "UID:larp-chicken-and-sticky-rice-20261130T023000Z@pantsonmyhead.com", "DTSTAMP:20261122T230000Z",
  "DTSTART:20261129T023000Z", "DTEND:20261130T023000Z", "SUMMARY:Cook: Larp Chicken & Sticky Rice",
  "DESCRIPTION:1 day start to finish. The meal is at the end of this event.\\nh",
  " ttps://pantsonmyhead.com/grub/#/r/larp-chicken-and-sticky-rice",
  "URL:https://pantsonmyhead.com/grub/#/r/larp-chicken-and-sticky-rice",
  "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Start cooking: Larp Chicken & Sticky Rice", "TRIGGER:-PT10M", "END:VALARM", "END:VEVENT",
  "BEGIN:VEVENT", "UID:pad-thai-baby-20261130T023000Z@pantsonmyhead.com", "DTSTAMP:20261122T230000Z",
  "DTSTART:20261130T013000Z", "DTEND:20261130T023000Z", "SUMMARY:Cook: Pad Thai\\, Baby",
  "DESCRIPTION:1 hour start to finish. The meal is at the end of this event.\\n",
  " https://pantsonmyhead.com/grub/#/r/pad-thai-baby",
  "URL:https://pantsonmyhead.com/grub/#/r/pad-thai-baby",
  "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Start cooking: Pad Thai\\, Baby", "TRIGGER:-PT10M", "END:VALARM", "END:VEVENT",
  "END:VCALENDAR", ""]);
check("plan ics with one event is the single file", buildPlanIcs({ events: [{ id: "sample-skillet-lemon-chicken", title: "Skillet Lemon Chicken Thighs", totalMinutes: 50 }],
  mealMs: Date.UTC(2026, 10, 27, 2, 30), nowMs: Date.UTC(2026, 10, 22, 23, 0), alarmMinutes: 10, siteUrl: "https://pantsonmyhead.com/" }), v1);
check("plan ics no alarm, lines within 75 octets", (() => {
  const t = buildPlanIcs({ events: [{ id: "a", title: "Ä".repeat(60), totalMinutes: 5 }, { id: "b", title: "B", totalMinutes: 50 }], mealMs: 0, nowMs: 0, alarmMinutes: null, siteUrl: "https://x/" });
  return [t.includes("VALARM"), t.split("BEGIN:VEVENT").length - 1, t.split("\r\n").every((x) => new TextEncoder().encode(x).length <= 75), t.endsWith("END:VCALENDAR\r\n")];
})(), [false, 2, true, true]);
check("plan file name, one recipe", planFileName(["Pad Thai, Baby"], "2026-11-29"), "Cook Pad Thai Baby.ics");
check("plan file name, several", planFileName(["A", "B"], "2026-11-29"), "Meal plan 2026-11-29.ics");
check("iso stamp", isoStamp(Date.UTC(2026, 10, 22, 22, 40, 0)), "2026-11-22T22:40:00Z");

// the ingredient-line parser
const P = (line) => parseIngredientLine(line);
const I = (qty, unit, name, note = "") => ({ qty, unit, name, note });
check("parse amount, unit, name, note", P("2 cloves garlic, smashed"), I("2", "cloves", "garlic", "smashed"));
check("parse mixed fraction", P("1 1/2 cups flour"), I("1 1/2", "cups", "flour"));
check("parse a couple", P("A couple green onions"), I("A couple", "", "green onions"));
check("parse no amount with a note", P("salt, to taste"), I("", "", "salt", "to taste"));
check("parse unit then a long name", P("12 oz pad Thai rice sticks"), I("12", "oz", "pad Thai rice sticks"));
check("parse number and bracket", P("4 (ish) eggs"), I("4 (ish)", "", "eggs"));
check("parse size in brackets", P("1 (14 oz) can coconut milk"), I("1 (14 oz)", "can", "coconut milk"));
check("parse a half cup", P("A half cup ground peanuts"), I("A half", "cup", "ground peanuts"));
check("parse a teaspoon", P("A teaspoon paprika"), I("A", "teaspoon", "paprika"));
check("parse a few", P("a few eggs"), I("a few", "", "eggs"));
check("parse half a", P("half a lemon"), I("half a", "", "lemon"));
check("parse fraction and unit", P("1/4 cup warm water"), I("1/4", "cup", "warm water"));
check("parse fraction no unit", P("1/2 yellow onion"), I("1/2", "", "yellow onion"));
check("parse count and note", P("2 hoagies, halved"), I("2", "", "hoagies", "halved"));
check("parse range", P("2 to 3 cloves garlic"), I("2 to 3", "cloves", "garlic"));
check("parse dash range", P("2-3 carrots"), I("2-3", "", "carrots"));
check("parse one-character fraction", P("½ cup sugar"), I("½", "cup", "sugar"));
check("parse number word", P("two eggs"), I("two", "", "eggs"));
check("parse unit of", P("2 cups of flour"), I("2", "cups of", "flour"));
check("parse pinch of", P("pinch of salt"), I("", "pinch of", "salt"));
check("parse a couple of cloves of", P("A couple of cloves of garlic"), I("A couple of", "cloves of", "garlic"));
check("parse keeps the first comma for the note", P("75 egg roll wraps, spring roll wraps might work; lumpia wraps break too easily"),
  I("75", "", "egg roll wraps", "spring roll wraps might work; lumpia wraps break too easily"));
check("parse unsure: the whole line is the name", P("5ish lime leaves"), I("", "", "5ish lime leaves"));
check("parse unsure: words first", P("Large bunch of green onions"), I("", "", "Large bunch of green onions"));
check("parse unsure: a something", P("A good loaf of bread"), I("", "", "A good loaf of bread"));
check("parse a number alone stays a name", P("2"), I("", "", "2"));
check("parse a unit with nothing after it is a name", P("2 cups"), I("2", "", "cups"));
check("parse name starting with a digit and letters", P("7UP"), I("", "", "7UP"));
check("parse strips a list bullet and extra spaces", P("  -   3   eggs "), I("3", "", "eggs"));
check("parse joke line", P("Joke: 12 drummers drumming"), { qty: "", unit: "", name: "12 drummers drumming", note: "", aside: true });
check("ingredient line of a joke", ingredientLine({ qty: "", unit: "", name: "12 drummers drumming", note: "", aside: true }), "Joke: 12 drummers drumming");
check("every parsed line reads back as it was typed", ["2 cloves garlic, smashed", "1 1/2 cups flour", "A couple green onions", "salt, to taste",
  "2 cups of flour", "pinch of salt", "1 (14 oz) can coconut milk", "5ish lime leaves"].filter((x) => ingredientText(P(x)) !== x), []);

check("ingredient groups", parseIngredients("2 eggs\n\nSauce:\n2 cups stock\nsalt, to taste\n\nNoodles:\n12 oz rice sticks"), [
  { section: "", items: [I("2", "", "eggs")] },
  { section: "Sauce", items: [I("2", "cups", "stock"), I("", "", "salt", "to taste")] },
  { section: "Noodles", items: [I("12", "oz", "rice sticks")] }]);
check("step groups", parseSteps("Preparation:\nChop.\n  Mix.  \n\nCook ‘er up:\n24 Hours Prior: soak the rice\n"), [
  { section: "Preparation", items: ["Chop.", "Mix."] }, { section: "Cook ‘er up", items: ["24 Hours Prior: soak the rice"] }]);
check("a heading with nothing under it is dropped", parseSteps("Preparation:\n\nCook:\nFry."), [{ section: "Cook", items: ["Fry."] }]);
check("a lone colon starts a group with no name", parseSteps("One.\n:\nTwo."), [{ section: "", items: ["One."] }, { section: "", items: ["Two."] }]);
const kept = { qty: "2 forkfuls", unit: "", name: "Mama Lil’s peppers", note: "" };
check("an untouched line keeps the item it came from", parseIngredients("2 forkfuls Mama Lil’s peppers\n2 forkfuls Mama Lil’s peppers", [["2 forkfuls Mama Lil’s peppers", kept]]),
  [{ section: "", items: [kept, I("2", "", "forkfuls Mama Lil’s peppers")] }]);

// the draft form: a recipe into the boxes and back, on every recipe the site has
const clean = (x) => { const c = JSON.parse(JSON.stringify(x)); delete c.pdf; delete c._words; return c; };
const NOW = "2030-01-02T03:04:05Z";
check("round trip: every recipe comes back the same, key for key",
  data.recipes.filter((x) => JSON.stringify(recipeFromDraft(draftFromRecipe(x, "d1", 0), NOW)) !== JSON.stringify(clean(x))).map((x) => x.id), []);
check("round trip: still the same after the draft has been stored and read",
  data.recipes.filter((x) => JSON.stringify(recipeFromDraft(JSON.parse(JSON.stringify(draftFromRecipe(x, "d1", 0))), NOW)) !== JSON.stringify(clean(x))).map((x) => x.id), []);
// (this check used to say there are exactly twelve recipes; a thirteenth is not a fault)
check("round trip covers every recipe in the data file", data.recipes.length > 0 && data.recipes.every((x) => typeof x.id === "string" && x.id), true);
check("round trip: an untouched draft is not changed", data.recipes.some((x) => draftChanged(draftFromRecipe(x, "d1", 0))), false);
check("the recipe file reads back as the recipe", data.recipes.every((x) => {
  const text = recipeFileText(recipeFromDraft(draftFromRecipe(x, "d1", 0), NOW));
  return text.endsWith("}\n") && text.startsWith("{\n  \"schema\": 1,\n  \"id\": ") && JSON.stringify(JSON.parse(text)) === JSON.stringify(clean(x));
}), true);
const textOnly = data.recipes.filter((x) => {
  const d = draftFromRecipe(x, "d1", 0);
  d.origin.known = [];
  return JSON.stringify(recipeFromDraft(d, NOW)) === JSON.stringify(clean(x));
}).length;
say("info " + textOnly + " of " + data.recipes.length + " recipes come back the same through the text alone; the rest need the kept items for amounts in his own words");

const padThai = data.recipes.find((x) => x.id === "pad-thai-baby"), larp = data.recipes.find((x) => x.id === "larp-chicken-and-sticky-rice");
const edited = draftFromRecipe(padThai, "d1", 0);
edited.fields.title = "Pad Thai, Baby (veggie)";
const e1 = recipeFromDraft(edited, NOW);
check("a changed copy keeps the address and goes up a version", [e1.id, e1.version, e1.created, e1.updated, e1.title], ["pad-thai-baby", padThai.version + 1, padThai.created, NOW, "Pad Thai, Baby (veggie)"]);
check("a changed copy is changed", draftChanged(edited), true);
edited.separate = true;
const e2 = recipeFromDraft(edited, NOW);
check("a separate recipe gets its own address", [e2.id, e2.version, e2.created, e2.updated], ["pad-thai-baby-veggie", 1, NOW, NOW]);
const guess = draftFromRecipe(larp, "d1", 0);
guess.fields.headnote = "Changed.";
check("a guess stays a guess while the minutes stand", recipeFromDraft(guess, NOW).total_minutes_estimated, true);
guess.fields.hours = "20";
const g2 = recipeFromDraft(guess, NOW);
check("his own minutes are not a guess", [g2.total_minutes, "total_minutes_estimated" in g2, g2.active_minutes], [1200, false, 50]);
guess.fields.hours = ""; guess.fields.minutes = "30";
check("hands-on time is dropped when it no longer fits", "active_minutes" in recipeFromDraft(guess, NOW), false);
check("only the ingredient line he changed is read again", (() => {
  const d = draftFromRecipe(padThai, "d1", 0);
  d.fields.ingredients = d.fields.ingredients.replace("A couple green onions", "3 green onions, sliced");
  const items = recipeFromDraft(d, NOW).ingredients[0].items;
  return [items.length, items[5], items[4], items.filter((x) => x.aside).length];
})(), [14, I("3", "", "green onions", "sliced"), I("4 (ish)", "", "eggs"), 3]);

const fresh = { id: "d2", touched: 0, separate: false, fields: { ...emptyFields(), title: "  Tosh’s 'Ritos & more ", chapter: "Grub", hours: "", minutes: "50",
  timeText: "about an hour", serves: "2 people", headnote: "Hot.", ingredients: "2 cloves garlic, smashed\nJoke: a moat\nSauce:\n1 1/2 cups stock",
  steps: "Preparation:\nSmash the garlic.\nCook:\nFry it.", tips: "Eat it hot.\n\nDon't burn it.", credit: "Tosh", tags: "burritos, Beans ,," } };
check("a new draft becomes the recipe file, fields in the files' order", recipeFromDraft(fresh, NOW), {
  schema: 1, id: "toshs-ritos-and-more", version: 1, created: NOW, updated: NOW, title: "Tosh’s 'Ritos & more", section: "Grub", source: "Tosh",
  headnote: "Hot.", yield: "2 people", time_text: "about an hour", total_minutes: 50, tags: ["burritos", "Beans"],
  ingredients: [{ section: "", items: [I("2", "cloves", "garlic", "smashed"), { qty: "", unit: "", name: "a moat", note: "", aside: true }] },
    { section: "Sauce", items: [I("1 1/2", "cups", "stock")] }],
  steps: [{ section: "Preparation", items: ["Smash the garlic."] }, { section: "Cook", items: ["Fry it."] }],
  notes: ["Eat it hot.", "Don't burn it."] });
check("a new draft's key order", Object.keys(recipeFromDraft(fresh, NOW)).join(" "),
  "schema id version created updated title section source headnote yield time_text total_minutes tags ingredients steps notes");
check("empty boxes leave their fields out", Object.keys(recipeFromDraft({ id: "d3", fields: { ...emptyFields(), title: "Toast", minutes: "5", ingredients: "bread", steps: "Toast it." } }, NOW)).join(" "),
  "schema id version created updated title total_minutes tags ingredients steps");
check("a finished draft has nothing missing", draftProblems(fresh), []);
check("recipe file name", recipeFileName(recipeFromDraft(fresh, NOW)), "toshs-ritos-and-more.json");
// (this check used to expect 1.5 hours to count as 0; that was the fault, see the third version below)
check("total minutes from the two boxes", [totalMinutes({ hours: "1", minutes: "30" }), totalMinutes({ hours: "", minutes: "50" }), totalMinutes({ hours: " 2 ", minutes: "" }),
  totalMinutes({ hours: "1.5", minutes: "" }), totalMinutes({ hours: "", minutes: "-5" })], [90, 50, 120, 90, 0]);
check("fields from a recipe: the time boxes", [fieldsFromRecipe(larp).hours, fieldsFromRecipe(larp).minutes, fieldsFromRecipe(padThai).hours, fieldsFromRecipe(padThai).minutes], ["24", "", "1", ""]);
const blank = draftProblems({ id: "d4", fields: emptyFields() });
check("an empty draft says what is missing", blank.length, 4);
check("no total time is refused in plain words", draftProblems({ id: "d5", fields: { ...fresh.fields, hours: "", minutes: "0" } }),
  ["It needs a total time above zero. The start time and the calendar file are worked out from it."]);
check("a title of only symbols is refused", draftProblems({ id: "d6", fields: { ...fresh.fields, title: "???" } }).length, 1);
check("more than two weeks is refused", draftProblems({ id: "d7", fields: { ...fresh.fields, hours: "400" } }), ["The total time can be two weeks at most."]);

// shopping: merged amounts and the running list
check("amount text drops a trailing of", amountText({ qty: "2 handfuls of", unit: "" }), "2 handfuls");
check("merge the same ingredient from two recipes", mergedLines([{ name: "garlic", qty: "2", unit: "cloves" }, { name: "eggs", qty: "4 (ish)", unit: "" },
  { name: "Garlic", qty: "4", unit: "cloves" }]), ["Garlic (2 cloves + 4 cloves)", "Eggs (4 (ish))"]);
check("merge with and without an amount", mergedLines([{ name: "Butter", qty: "", unit: "" }, { name: "butter", qty: "1", unit: "tablespoon" }]), ["Butter (1 tablespoon + some)"]);
check("merge two without amounts", mergedLines([{ name: "Butter", qty: "", unit: "" }, { name: "butter", qty: "", unit: "" }]), ["Butter"]);
check("merge nothing", mergedLines([]), []);
check("real ingredients leave the joke lines out", realIngredients(padThai).length, padThai.ingredients[0].items.length - 3);
const burgers = data.recipes.find((x) => x.id === "simple-bangin-burgers");
let list = addFromRecipe([], padThai, realIngredients(padThai).slice(0, 3));
check("add from a recipe", [list.added, list.already, list.list.map((x) => x.name), list.list[1].recipeId, list.list[1].got], [3, 0, ["pad Thai rice sticks", "garlic", "fish sauce"], "pad-thai-baby", false]);
list = setGot(list.list, list.list[1].key, true);
check("tick one", counts(list), { toGet: 2, got: 1 });
check("ticked things are not copied", copyLines(list), ["Pad Thai rice sticks (12 oz)", "Fish sauce (4 tablespoons)"]);
let again = addFromRecipe(list, padThai, realIngredients(padThai).slice(1, 2));
check("adding it again puts it back on the to-get side, once", [again.added, again.already, again.list.length, counts(again.list).got], [0, 1, 3, 0]);
again = addOwn(addFromRecipe(again.list, burgers, realIngredients(burgers).filter((x) => x.name === "garlic")).list, "  Paper   towels ");
check("the same thing from two recipes is copied once with both amounts", copyLines(again.list), ["Pad Thai rice sticks (12 oz)", "Garlic (2 cloves + 2 cloves)", "Fish sauce (4 tablespoons)", "Paper towels"]);
check("with everything ticked there is nothing to copy", copyLines(again.list.map((x) => ({ ...x, got: true }))), []);
again = addFromRecipe(again.list, padThai, realIngredients(padThai).slice(3, 4));
check("groups by recipe, his own last", groups(again.list).map((g) => [g.title, g.items.length]), [["Pad Thai, Baby", 4], ["Simple Bangin Burgers", 1], [OWN_TITLE, 1]]);
check("an empty own item adds nothing", addOwn(again.list, "   ").added, 0);
check("remove one", removeItem(again.list, again.list[0].key).length, again.list.length - 1);
check("clear ticked", clearTicked(setGot(again.list, again.list[0].key, true)).length, again.list.length - 1);
check("the list ops leave the old list alone", [list.length, list[1].got], [3, true]);

// the plan
const p0 = addToPlan(addToPlan(addToPlan(emptyPlan(), "pad-thai-baby"), "larp-chicken-and-sticky-rice"), "pad-thai-baby");
check("add to plan, no doubles", p0.items.map((x) => x.id), ["pad-thai-baby", "larp-chicken-and-sticky-rice"]);
const meal = Date.UTC(2026, 10, 30, 2, 30);
const entries = planEntries(p0, data.recipes, meal);
check("plan entries, earliest start first", entries.map((x) => [x.id, x.minutes, x.guess, (meal - x.startMs) / 60000]),
  [["larp-chicken-and-sticky-rice", 1440, true, 1440], ["pad-thai-baby", 60, false, 60]]);
const fakeDay = (ms) => "D" + new Date(ms).getUTCDate(), fakeClock = (ms) => new Date(ms).toISOString().slice(11, 16);
check("plan lines", planLines(entries, meal, fakeDay, fakeClock), ["Start Larp Chicken & Sticky Rice D29 at 02:30", "Start Pad Thai, Baby D30 at 01:30", "Eat at 02:30"]);
const p1 = setPlanMinutes(setPlanMinutes(p0, "larp-chicken-and-sticky-rice", 30), "pad-thai-baby", 5);
check("his minutes count only where the time is a guess", planEntries(p1, data.recipes, meal).map((x) => [x.id, x.minutes, x.changed]),
  [["pad-thai-baby", 60, false], ["larp-chicken-and-sticky-rice", 30, true]]);
check("bad minutes fall back to the recipe's", planEntries(setPlanMinutes(p0, "larp-chicken-and-sticky-rice", 0), data.recipes, meal)[0].minutes, 1440);
check("a recipe that has gone is left out", planEntries(addToPlan(p0, "not-a-recipe"), data.recipes, meal).length, 2);
check("remove from plan", removeFromPlan(p0, "pad-thai-baby").items.map((x) => x.id), ["larp-chicken-and-sticky-rice"]);
check("meal time from the two boxes", mealMsOf("2026-11-29", "18:30"), new Date(2026, 10, 29, 18, 30).getTime());
check("meal time needs both", [mealMsOf("", "18:30"), mealMsOf("2026-11-29", ""), mealMsOf("nope", "18:30")], [null, null, null]);
const noon = new Date(2026, 10, 22, 12, 0).getTime();
check("default day: today when there is time", defaultDay(noon, "18:30", 60), "2026-11-22");
check("default day: tomorrow when cooking would have had to start", defaultDay(noon, "18:30", 420), "2026-11-23");
check("default day: a day-long recipe", defaultDay(noon, "18:30", 1440 + 420), "2026-11-24");
check("date value", dateValue(new Date(2026, 0, 5, 9, 0).getTime()), "2026-01-05");

// browse and the words on the pages
const three = [{ id: "a", title: "A", section: "Grub", total_minutes: 30, ingredients: [] }, { id: "b", title: "B", section: "Drank", total_minutes: 31, ingredients: [] },
  { id: "c", title: "C soup", total_minutes: 600, ingredients: [] }];
check("narrow by time", narrow(three, { maxMinutes: 30 }).map((x) => x.id), ["a"]);
check("narrow by chapter", narrow(three, { chapter: "Drank" }).map((x) => x.id), ["b"]);
check("narrow: no chapter is Other", narrow(three, { chapter: "Other" }).map((x) => x.id), ["c"]);
check("narrow by words and time", narrow(three, { query: "sou", maxMinutes: 60 }).map((x) => x.id), []);
check("narrow by nothing", narrow(three).length, 3);
check("chapter list", chapterList(["Brekky", "Grub"], three), ["Brekky", "Grub", "Drank", "Other"]);
check("count text", [countText(1, "recipe", "recipes"), countText(0, "recipe", "recipes")], ["1 recipe", "0 recipes"]);
check("time facts: his own words", timeFacts(padThai), { ready: "Ready in an hour including prep", guess: "" });
check("time facts: a guess is said to be a guess", timeFacts({ total_minutes: 600, total_minutes_estimated: true, time_text: "most of a day" }),
  { ready: "Ready in most of a day", guess: "The total time is a guess. Plans count it as 10 hours, and you can change that in Prep." });
check("time facts: a guess with no words of his", timeFacts({ total_minutes: 18, total_minutes_estimated: true }).ready, "Ready in about 18 minutes");
check("time facts: nothing yet", timeFacts({ total_minutes: 0 }).ready, "No total time yet");
check("short time", [shortTime({ total_minutes: 60 }), shortTime({ total_minutes: 1440, total_minutes_estimated: true }), shortTime({ total_minutes: 1500 })], ["1 hour", "about 1 day", "1 day 1 hour"]);
check("every guessed recipe says so", data.recipes.filter((x) => x.total_minutes_estimated && !timeFacts(x).guess).length, 0);

// storage: the prefix, the format number, and a browser with storage switched off
const box = new Map();
const working = { getItem: (k) => (box.has(k) ? box.get(k) : null), setItem: (k, v) => { box.set(k, String(v)); }, removeItem: (k) => { box.delete(k); } };
const s1 = makeStore(working);
check("store: nothing yet gives the fallback", s1.get("stars", 1, ["x"]), ["x"]);
check("store: set says it was kept", s1.set("stars", 1, ["a", "b"]), true);
check("store: read back", s1.get("stars", 1, []), ["a", "b"]);
check("store: the key is prefixed and the value carries its format number", [[...box.keys()], PREFIX, JSON.parse(box.get("grub.stars"))], [["grub.stars"], "grub.", { v: 1, data: ["a", "b"] }]);
check("store: another format number is dropped", s1.get("stars", 2, "fallback"), "fallback");
box.set("grub.plan", "{not json");
check("store: damaged text is dropped", s1.get("plan", 1, null), null);
box.set("grub.plan", "[1,2]");
check("store: text that is not ours is dropped", s1.get("plan", 1, null), null);
check("store: another tab's write is seen", (() => { box.set("grub.stars", JSON.stringify({ v: 1, data: ["z"] })); return s1.get("stars", 1, []); })(), ["z"]);
s1.remove("stars");
check("store: removed", [s1.get("stars", 1, "gone"), box.has("grub.stars")], ["gone", false]);
const broken = () => { throw new Error("storage is off"); };
const s2 = makeStore({ getItem: broken, setItem: broken, removeItem: broken });
check("store off: nothing yet gives the fallback", s2.get("shopping", 1, []), []);
check("store off: set says it was not kept", s2.set("shopping", 1, [{ key: "k" }]), false);
check("store off: the visit still has it", s2.get("shopping", 1, []), [{ key: "k" }]);
s2.set("shopping", 1, []);
check("store off: a second write wins", s2.get("shopping", 1, null), []);
s2.remove("shopping");
check("store off: removed", s2.get("shopping", 1, "gone"), "gone");
const full = makeStore({ getItem: (k) => (k === "grub.drafts" ? JSON.stringify({ v: 1, data: ["old"] }) : null), setItem: broken, removeItem: broken });
check("store full: the stored value is read", full.get("drafts", 1, []), ["old"]);
full.set("drafts", 1, ["new"]);
check("store full: a write that did not fit is still what the visit reads", full.get("drafts", 1, []), ["new"]);
full.remove("drafts");
check("store full: a remove that failed still reads as gone", full.get("drafts", 1, "gone"), "gone");
const s3 = makeStore({ getItem: () => undefined, setItem: () => {}, removeItem: () => {} });
check("store: a backend that answers undefined gives the fallback", s3.get("eatAt", 1, "18:30"), "18:30");

/* ---------- third version: what the three reviews found ---------- */

// a test page that writes to the site's storage only ever runs on this machine
check("storage tests run on 127.0.0.1 and localhost", [localOnly("127.0.0.1"), localOnly("localhost"), localOnly("[::1]")], [true, true, true]);
check("storage tests never run where the site lives", [localOnly("pantsonmyhead.com"), localOnly("someone.github.io"), localOnly(""), localOnly("localhost.evil.example")], [false, false, false, false]);

// the pages can tell when nothing is really being kept
check("store: a working backend keeps things, and the check leaves nothing behind", [makeStore(working).keeps(), [...box.keys()].some((k) => k.endsWith("check"))], [true, false]);
check("store off: says nothing is kept", s2.keeps(), false);
check("store full: a refused write means not kept", full.keeps(), false);
const late = new Map();
let shut = true;
const comesBack = makeStore({ getItem: (k) => (late.has(k) ? late.get(k) : null),
  setItem: (k, v) => { if (shut) throw new Error("shut"); late.set(k, v); }, removeItem: (k) => { if (shut) throw new Error("shut"); late.delete(k); } });
comesBack.set("stars", 1, ["a"]);
comesBack.set("plan", 1, { items: [] });
comesBack.remove("plan");
check("store shut: nothing reaches the device, and it says so", [comesBack.keeps(), late.size], [false, 0]);
shut = false;
check("store open again: what the visit held is written, a removed thing stays removed, and it is kept from then on",
  [comesBack.keeps(), [...late.entries()], comesBack.get("stars", 1, []), comesBack.get("plan", 1, "gone")], [true, [["grub.stars", JSON.stringify({ v: 1, data: ["a"] })]], ["a"], "gone"]);

// the addresses
const routeOf = (hash) => { const x = parseRoute(hash); return [x.name, x.arg, x.query.toString()]; };
check("route: home", [routeOf(""), routeOf("#/"), routeOf("#app")], [["home", null, ""], ["home", null, ""], ["home", null, ""]]);
check("route: the five areas", ["#/browse", "#/saved", "#/shopping", "#/prep", "#/draft", "#/draft/"].map((x) => routeOf(x)[0]), ["browse", "saved", "shopping", "prep", "draft", "draft"]);
check("route: a recipe and a draft", [routeOf("#/r/pad-thai-baby"), routeOf("#/draft/dabc123")], [["recipe", "pad-thai-baby", ""], ["draft", "dabc123", ""]]);
check("route: a copy of a recipe as a draft", routeOf("#/draft?copy=spring-rolls"), ["draft", null, "copy=spring-rolls"]);
check("route: browse with filters", routeOf("#/browse?chapter=Grub&q=pea+nut&time=30"), ["browse", null, "chapter=Grub&q=pea+nut&time=30"]);
check("route: anything else is missing", ["#/nowhere", "#/r/", "#/r/Bad_Id", "#/draft/a/b"].map((x) => routeOf(x)[0]), ["missing", "missing", "missing", "missing"]);

// Browse keeps what is picked in the address and nowhere else
const chaptersNow = ["Brekky", "Grub", "Drank"];
const stateOf = (text) => browseState(new URLSearchParams(text), chaptersNow);
check("browse state: nothing in the address is nothing picked", stateOf(""), { query: "", chapter: "", maxMinutes: 0, minDays: 0 });
check("browse state: read from the address", stateOf("chapter=Grub&q=pea+nut&time=30"), { query: "pea nut", chapter: "Grub", maxMinutes: 30, minDays: 0 });
check("browse state: an unknown chapter or time is off", stateOf("chapter=Nope&time=31"), { query: "", chapter: "", maxMinutes: 0, minDays: 0 });
check("browse address: nothing picked is the plain address", browseHash({ query: "  ", chapter: "", maxMinutes: 0 }), "#/browse");
check("browse address: what is picked", browseHash({ query: "pea nut", chapter: "Grub", maxMinutes: 60 }), "#/browse?chapter=Grub&q=pea+nut&time=60");
check("browse address and back, with awkward letters", (() => {
  const picked = { query: "jalapeño & lime?", chapter: "Drank", maxMinutes: 30 };
  return browseState(parseRoute(browseHash(picked)).query, chaptersNow);
})(), { query: "jalapeño & lime?", chapter: "Drank", maxMinutes: 30, minDays: 0 });

// the site is the same on every device: nothing in it asks which device or browser this is
check("no part of the logic tells one device or browser from another", ["isIosDevice", "storageCanLapse", "shortcutUrl", "SHORTCUT_NAME"].filter((name) => name in lib), []);

// the tablet PDF link is only ever one of the site's own files
check("pdf link: the site's own file", data.recipes.every((x) => pdfHref(x) === x.pdf && x.pdf), true);
check("pdf link: anything else is no link", [{ pdf: "javascript:alert(1)" }, { pdf: "https://example.com/a.pdf" }, { pdf: "pdf/../x.pdf" }, { pdf: "/pdf/a-v1.pdf" }, { pdf: 5 }, {}].map(pdfHref),
  [null, null, null, null, null, null]);

// the time boxes: a decimal counts, anything that is not a plain number is said, never counted as zero
const T = (hours, minutes) => totalMinutes({ hours, minutes });
check("time boxes: one and a half hours", [T("1.5", ""), T("1,5", ""), T("1.5", "30"), T("0.25", ""), T("", "7.5")], [90, 90, 120, 15, 8]);
check("time boxes: a number box that comes back as a number", [T(2, 15), T(null, undefined)], [135, 0]);
check("time boxes: plain numbers have no problem", [timeProblem({ hours: "1.5", minutes: "30" }), timeProblem({ hours: "", minutes: "" })], ["", ""]);
check("time boxes: a minus sign or a word is a problem, in plain words", [timeProblem({ hours: "-2", minutes: "45" }), timeProblem({ hours: "", minutes: "abc" }), timeProblem({ hours: "1e3", minutes: "" })],
  Array(3).fill("The time boxes take numbers only, like 1 hour 30 minutes."));
check("a draft with a time box that is not a number is refused, not saved with a wrong time",
  [draftProblems({ id: "d8", fields: { ...fresh.fields, hours: "-2", minutes: "45" } }), recipeFromDraft({ id: "d8", fields: { ...fresh.fields, hours: "-2", minutes: "45" } }, NOW).total_minutes],
  [["The time boxes take numbers only, like 1 hour 30 minutes."], 0]);
check("a draft with 1.5 hours and 30 minutes is two hours", [draftProblems({ id: "d9", fields: { ...fresh.fields, hours: "1.5", minutes: "30" } }), recipeFromDraft({ id: "d9", fields: { ...fresh.fields, hours: "1.5", minutes: "30" } }, NOW).total_minutes], [[], 120]);
check("an empty form is blank, one letter is not", [fieldsBlank(emptyFields()), fieldsBlank({ ...emptyFields(), tags: "  " }), fieldsBlank({ ...emptyFields(), title: "a" })], [true, true, false]);

// pasted lists: the page numbers the steps and bullets the tips itself
check("steps pasted with numbers or bullets lose them", parseSteps("1. Toast the bread\n2) Butter it\n- Eat\n* Nap\n• Wake"), [{ section: "", items: ["Toast the bread", "Butter it", "Eat", "Nap", "Wake"] }]);
check("a step that only starts with a number keeps it", parseSteps("24 Hours Prior: soak the rice\n350 degrees for an hour\n2.5 cups go in"), [{ section: "", items: ["24 Hours Prior: soak the rice", "350 degrees for an hour", "2.5 cups go in"] }]);
check("tips pasted with bullets lose them", recipeFromDraft({ id: "d10", fields: { ...fresh.fields, tips: "- Eat it hot.\n• Don't burn it." } }, NOW).notes, ["Eat it hot.", "Don't burn it."]);

// what is read from the device is made safe before a page touches it
const goodDraft = draftFromRecipe(padThai, "d1", 5);
check("clean draft: a good one is left as it is", cleanDraft(JSON.parse(JSON.stringify(goodDraft))), JSON.parse(JSON.stringify(goodDraft)));
check("clean draft: every recipe still comes back the same after storage and cleaning",
  data.recipes.filter((x) => JSON.stringify(recipeFromDraft(cleanDraft(JSON.parse(JSON.stringify(draftFromRecipe(x, "d1", 0)))), NOW)) !== JSON.stringify(clean(x))).map((x) => x.id), []);
check("clean draft: not a draft", [null, 5, "x", {}, { id: "d1" }, { id: "Bad Id", fields: {} }, { id: 7, fields: {} }].map(cleanDraft), Array(7).fill(null));
const mended = cleanDraft({ id: "d1", touched: "soon", separate: "yes", fields: { title: 5, steps: ["a"], hours: "2", extra: "x" }, origin: "str" });
check("clean draft: wrong fields become empty text, and a broken origin is dropped", [mended.fields, mended.touched, mended.separate, "origin" in mended],
  [{ ...emptyFields(), hours: "2" }, 0, false, false]);
check("clean draft: a time that is no time reads as never", [cleanDraft({ id: "d1", touched: 1e20, fields: {} }).touched, cleanDraft({ id: "d1", touched: NaN, fields: {} }).touched], [0, 0]);
check("clean draft: an origin missing a part is dropped whole", ["origin" in cleanDraft({ ...goodDraft, origin: {} }), "origin" in cleanDraft({ ...goodDraft, origin: { ...goodDraft.origin, known: "x" } }),
  "origin" in cleanDraft({ ...goodDraft, origin: { ...goodDraft.origin, version: "1" } })], [false, false, false]);
check("clean draft: the mended draft can be drawn and checked", [draftProblems(mended).length > 0, draftChanged(mended), recipeFromDraft(mended, NOW).total_minutes], [true, true, 120]);

check("clean plan: a good one is left as it is", cleanPlan({ items: [{ id: "a", minutes: 30 }, { id: "b", minutes: null }], date: "2026-11-29", time: "18:30", alarm: "30", dayChosen: true }),
  { items: [{ id: "a", minutes: 30 }, { id: "b", minutes: null }], date: "2026-11-29", time: "18:30", alarm: "30", dayChosen: true });
check("clean plan: not a plan", [null, 5, "x", []].map(cleanPlan), Array(4).fill(emptyPlan()));
check("clean plan: bad minutes, a doubled recipe, a bad day and a bad time",
  cleanPlan({ items: [{ id: "a", minutes: "abc" }, { id: "a", minutes: 5 }, { id: "b", minutes: 1e13 }, { id: "c", minutes: -30 }, { id: "d", minutes: 90.5 }, { id: 7 }, null], date: "soon", time: "99:99", alarm: 10, dayChosen: true }),
  { items: [{ id: "a", minutes: null }, { id: "b", minutes: null }, { id: "c", minutes: null }, { id: "d", minutes: null }], date: "", time: "", alarm: "10", dayChosen: false });
check("a day or time that does not exist is no meal time", [mealMsOf("2026-13-45", "18:30"), mealMsOf("2026-02-30", "18:30"), mealMsOf("2026-11-29", "99:99"), cleanPlan({ items: [], date: "2026-13-45", time: "18:30" }).date],
  [null, null, null, ""]);
check("a real time", [realTime("18:30"), realTime("00:00"), realTime("24:00"), realTime("18:60"), realTime("6:30"), realTime(1830)], [true, true, false, false, false, false]);

check("clean list: a good one is left as it is", cleanList(again.list), again.list);
check("clean list: not a list, and things that are not items", [cleanList("x"), cleanList([null, 5, { key: "k" }, { key: "k", name: "  " }, { key: 1, name: "Milk" }])], [[], []]);
check("clean list: wrong fields are put right and a doubled key is kept once", cleanList([{ key: "k", name: "Milk", qty: 2, unit: null, got: "yes", recipeId: 5 }, { key: "k", name: "Milk again" }]),
  [{ key: "k", recipeId: "", recipeTitle: "", name: "Milk", qty: "", unit: "", got: false }]);

// the plan's minutes: a whole number from one minute to two weeks, wherever it comes from
check("usable minutes", [1, 600, MAX_MINUTES, 0, -30, 90.5, MAX_MINUTES + 1, 999999999999, "60", null, NaN].map(usableMinutes), [true, true, true, false, false, false, false, false, false, false, false]);
check("his minutes for a plan stop at two weeks", [setPlanMinutes(p0, "larp-chicken-and-sticky-rice", 999999999999).items[1].minutes, setPlanMinutes(p0, "larp-chicken-and-sticky-rice", 50000).items[1].minutes,
  setPlanMinutes(p0, "larp-chicken-and-sticky-rice", MAX_MINUTES).items[1].minutes], [null, null, MAX_MINUTES]);
const stored = { ...p0, items: [{ id: "larp-chicken-and-sticky-rice", minutes: 1e13 }, { id: "pad-thai-baby", minutes: null }, { id: "pad-thai-baby", minutes: null }] };
check("a stored number that is no use falls back to the recipe's, and a doubled recipe is planned once",
  planEntries(stored, data.recipes, meal).map((x) => [x.id, x.minutes, Number.isFinite(x.startMs)]), [["larp-chicken-and-sticky-rice", 1440, true], ["pad-thai-baby", 60, true]]);
check("a negative stored number never puts the start after the meal", planEntries({ ...p0, items: [{ id: "larp-chicken-and-sticky-rice", minutes: -30 }] }, data.recipes, meal)[0].startMs < meal, true);
check("the longest thing in the plan", [longestMinutes(p0, data.recipes), longestMinutes(emptyPlan(), data.recipes)], [1440, 0]);

// the day: worked out again on every change until he sets it himself
const four = new Date(2026, 10, 22, 15, 58).getTime();
const opened = { ...emptyPlan(), time: "18:30", ...planDay({ ...emptyPlan(), time: "18:30" }, four, 0) };
check("plan day: Prep opened with nothing picked is today", opened, { items: [], date: "2026-11-22", time: "18:30", alarm: "10", dayChosen: false });
const withLarp = addToPlan(opened, "larp-chicken-and-sticky-rice");
check("plan day: a day-long recipe added afterwards moves the day, so it does not start in the past",
  planDay(withLarp, four, longestMinutes(withLarp, data.recipes)), { date: "2026-11-23", dayChosen: false });
check("plan day: a day he set himself is kept", planDay({ ...withLarp, date: "2026-11-22", dayChosen: true }, four, 1440), { date: "2026-11-22", dayChosen: true });
check("plan day: until that meal has passed", planDay({ ...withLarp, date: "2026-11-21", dayChosen: true }, four, 1440), { date: "2026-11-23", dayChosen: false });
check("plan day: with no time yet it still names a day", planDay({ ...emptyPlan(), time: "" }, four, 0), { date: "2026-11-22", dayChosen: false });

// a start a week or more before the meal names the date, not only the weekday
const longDay = (ms) => "L" + new Date(ms).getUTCDate();
const twoWeeks = planEntries({ ...p0, items: [{ id: "larp-chicken-and-sticky-rice", minutes: MAX_MINUTES }, { id: "pad-thai-baby", minutes: null }] }, data.recipes, meal);
check("start words: within the week it is the weekday", startWhen(entries[0], meal, fakeDay, fakeClock, longDay), "D29 at 02:30");
check("start words: a week or more ahead it is the date", planLines(twoWeeks, meal, fakeDay, fakeClock, longDay), ["Start Larp Chicken & Sticky Rice L16 at 02:30", "Start Pad Thai, Baby D30 at 01:30", "Eat at 02:30"]);
check("start words: exactly a week counts as far", startWhen({ startMs: meal - 7 * 86400000 }, meal, fakeDay, fakeClock, longDay), "L23 at 02:30");

// shopping: names with no Latin letters or digits are still different things
check("name key: letters fold, anything else is compared as typed", [nameKey("Piña  Colada!"), nameKey(" 🧄 "), nameKey("香菜"), nameKey("???")], ["pina colada", "🧄", "香菜", "???"]);
const emoji = addOwn(addOwn(addOwn([], "🧄").list, "🍋").list, "🧄");
check("own items: two emoji are two things, the same one twice is one", [emoji.list.map((x) => x.name), emoji.added, emoji.already], [["🧄", "🍋"], 0, 1]);
check("own items: other alphabets too", addOwn(addOwn([], "香菜").list, "豆腐").list.map((x) => x.name), ["香菜", "豆腐"]);
check("merged lines keep them apart", mergedLines([{ name: "🧄", qty: "2", unit: "" }, { name: "🍋", qty: "", unit: "" }, { name: "???", qty: "1", unit: "" }, { name: "🧄", qty: "", unit: "" }]),
  ["🧄 (2 + some)", "🍋", "??? (1)"]);

/* ---------- fourth version: the same site on any device, and what the last check left over ---------- */

// The shopping list stays in the site and leaves it by Copy list. No file the site serves may bring back the
// way out that only worked on Apple devices. Through tools/run_tests.py the server lists every file in the
// folder; anywhere else (this page is published with the site) the files are the ones the site itself links to.
async function siteFiles() {
  try {
    const res = await fetch("../__files"); // a relative address, like every address in the site: on the live site it stays inside the site's own folder
    if (res.ok) {
      const all = await res.json(); // "all" keeps the test pages too, for the checks that read those as well
      return { how: "every file in the folder", all, files: all.filter((name) => !name.startsWith("tests/")) };
    }
  } catch { /* not the local test server */ }
  const seen = new Set(["index.html", "manifest.webmanifest", "data/recipes.json"]);
  const page = await fetch("../index.html").then((x) => x.text());
  for (const m of page.matchAll(/(?:href|src)="([^"#:]+)"/g)) seen.add(m[1]);
  for (const name of seen) { // a script's own imports, followed until there are no new ones
    if (!name.endsWith(".js")) continue;
    const text = await fetch("../" + name).then((x) => x.text());
    for (const m of text.matchAll(/from "(\.{1,2}\/[^"]+)"/g)) seen.add(new URL(m[1], "https://x/" + name).pathname.slice(1));
  }
  return { how: "the files the site links to", files: [...seen] };
}
const site = await siteFiles();
const sweep = [];
for (const name of site.files) {
  const res = await fetch("../" + name);
  const text = res.ok ? await res.text() : "";
  if (!res.ok) sweep.push(name + " did not load");
  for (const [word, found] of [["shortcuts:", /shortcuts:/i], ["Shortcut", /shortcut/i], ["Reminders", /\breminders\b/i]]) {
    if (found.test(text) || found.test(name)) sweep.push(name + " has " + word);
  }
}
say("info the sweep read " + site.files.length + " files: " + site.how);
check("the sweep covers the page, the styles, the recipes and every script", ["index.html", "css/site.css", "data/recipes.json", "manifest.webmanifest", "js/app.js", "js/lib.js", "js/own.js", "js/pages/shopping.js", "js/pages/prep.js"]
  .filter((name) => !site.files.includes(name)), []);
check("no file of the site holds a shortcuts: address or the words Shortcut or Reminders", sweep, []);

// Prep: a day he set himself is not thrown away while the time box is empty or half typed
const chosen = { ...emptyPlan(), items: [{ id: "pad-thai-baby", minutes: null }], date: "2026-11-25", dayChosen: true };
check("plan day: his day is kept while there is no time", planDay({ ...chosen, time: "" }, four, 60), { date: "2026-11-25", dayChosen: true });
check("plan day: and while the time is half typed", [planDay({ ...chosen, time: "1" }, four, 60), planDay({ ...chosen, time: "25:00" }, four, 60)],
  [{ date: "2026-11-25", dayChosen: true }, { date: "2026-11-25", dayChosen: true }]);
check("plan day: once the time is real his day is judged as before", [planDay({ ...chosen, time: "19:00" }, four, 60), planDay({ ...chosen, date: "2026-11-21", time: "19:00" }, four, 60)],
  [{ date: "2026-11-25", dayChosen: true }, { date: "2026-11-22", dayChosen: false }]);
check("plan day: a day that is no day is not kept, time or no time", planDay({ ...chosen, date: "2026-13-45", time: "" }, four, 60), { date: "2026-11-22", dayChosen: false });
check("plan day: a day worked out for him is still worked out with no time", planDay({ ...chosen, dayChosen: false, time: "" }, four, 60), { date: "2026-11-22", dayChosen: false });

// time boxes: text the browser will not hand over ("--", "1e" in a number box) reads as empty, and is said, not counted as blank
check("time boxes: text the browser holds back is the same problem, in the same words", [timeProblem({ hours: "", minutes: "" }, true), timeProblem({ hours: "", minutes: "30" }, true), timeProblem({ hours: "1", minutes: "30" }, false)],
  ["The time boxes take numbers only, like 1 hour 30 minutes.", "The time boxes take numbers only, like 1 hour 30 minutes.", ""]);
check("a draft with held-back text in a time box is refused for that, not for a missing time",
  [draftProblems({ id: "d11", fields: { ...fresh.fields, hours: "", minutes: "" } }, { timeUnread: true }), draftProblems({ id: "d11", fields: { ...fresh.fields, hours: "", minutes: "30" } }, { timeUnread: true }),
    draftProblems({ id: "d11", fields: { ...fresh.fields, hours: "", minutes: "30" } })],
  [["The time boxes take numbers only, like 1 hour 30 minutes."], ["The time boxes take numbers only, like 1 hour 30 minutes."], []]);

// tips: a pasted list's numbers come off as they do for steps, and a tip that starts with an amount is left whole
check("tips pasted with numbers lose them", parseTips("1. First tip\n2) Second\n 10.  Tenth \n- Dash\n• Dot"), ["First tip", "Second", "Tenth", "Dash", "Dot"]);
check("a tip that starts with an amount keeps it", parseTips("2 cups is plenty\n2.5 cups is too much\n1/2 a lime will do\n350 degrees, no hotter\n3) is the charm"),
  ["2 cups is plenty", "2.5 cups is too much", "1/2 a lime will do", "350 degrees, no hotter", "is the charm"]);
check("a tip that is only a list number stays as typed, and empty lines go", parseTips("1.\n\n   \n2) "), ["1.", "2)"]);
check("the recipe file gets the tips without their numbers", recipeFromDraft({ id: "d12", fields: { ...fresh.fields, tips: "1. Eat it hot.\n2. Don't burn it.\n2 cups is plenty" } }, NOW).notes,
  ["Eat it hot.", "Don't burn it.", "2 cups is plenty"]);

// a copy of a recipe holds nothing of his own until it differs from the recipe, and again once it is changed back
const back = draftFromRecipe(padThai, "d13", 0);
const first = nothingToKeep(back);
back.fields.title = "Pad Thai, Baby II";
const second = nothingToKeep(back);
back.fields.title = padThai.title;
const third = nothingToKeep(back);
back.separate = true;
check("nothing to keep: an untouched copy, not a changed one, again once it is changed back, not one marked separate", [first, second, third, nothingToKeep(back)], [true, false, true, false]);
check("nothing to keep: a new draft with every box empty, and not one with a letter in it",
  [nothingToKeep({ id: null, fields: emptyFields() }), nothingToKeep({ id: null, fields: { ...emptyFields(), tips: " " } }), nothingToKeep({ id: null, fields: { ...emptyFields(), tips: "x" } })], [true, true, false]);

/* ---------- fifth version: the tag on a recipe that needs more than one day ---------- */

// the words of the tag are made in one place, and only from the recipe's days
check("days label: 2, 3 and 14", [2, 3, 14].map((n) => daysLabel({ days: n })), ["2-day recipe", "3-day recipe", "14-day recipe"]);
check("days label: nothing for a same-day recipe, or for days that is not a whole number from 2 to 14",
  [{}, { days: 1 }, { days: 0 }, { days: 15 }, { days: 2.5 }, { days: "2" }, { days: true }, { days: null }, null].map(daysLabel), Array(9).fill(""));
check("days of: the number, or 1 for the same day", [daysOf({ days: 2 }), daysOf({ days: 14 }), daysOf({}), daysOf({ days: 15 }), daysOf({ days: "3" })], [2, 14, 1, 1, 1]);
// (the checks on the real recipes say what is true of the larp, never that no other recipe is tagged: the day
// a second recipe gets its days, or a thirteenth recipe is added, nothing here is wrong)
check("the larp is a 2-day recipe", [larp.days, daysLabel(larp)], [2, "2-day recipe"]);
check("every recipe that carries days carries a number the tag can show", data.recipes.filter((x) => "days" in x && !daysLabel(x)).map((x) => x.id), []);
const wordFiles = [];
for (const name of site.files.filter((x) => x.endsWith(".js"))) {
  if ((await fetch("../" + name).then((x) => x.text())).includes("\"-day recipe\"")) wordFiles.push(name);
}
check("the tag's words are written in one script only, so they cannot drift", wordFiles, ["js/lib.js"]);

// the fewest days a total time allows
check("fewest days: under 24 hours it can be the same day (an overnight soak is the writer's call)", [1, 600, 840, 1439].map(minDays), [1, 1, 1, 1]);
check("fewest days: 24 hours is 2 days, 48 hours is 3", [1440, 1500, 2879, 2880, 4320].map(minDays), [2, 2, 2, 3, 4]);
check("fewest days: it stops at 14, so a total of two weeks can still be written down", [minDays(18719), minDays(18720), minDays(MAX_MINUTES), MAX_DAYS], [13, 14, 14, 14]);
check("every recipe on the site has at least the days its total time needs", data.recipes.filter((x) => daysOf(x) < minDays(x.total_minutes)).map((x) => x.id), []);

// search: the tag's words find a tagged recipe, from its days and nothing else
const beans = (days) => ({ title: "Slow Beans", section: "Grub", tags: [], total_minutes: 840, days,
  ingredients: [{ section: "", items: [{ qty: "1", unit: "lb", name: "beans", note: "" }] }] });
const finds = (recipe, typed) => matches(haystack(recipe), typed);
check("search: a 2-day recipe is found by the tag's words", ["2 day", "2-day", "two day", "2 days", "two-day", "TWO DAYS", "2-day recipe", "two day beans"].map((q) => finds(beans(2), q)), Array(8).fill(true));
check("search: and not by another number", ["3 day", "three day", "12 day", "twelve"].map((q) => finds(beans(2), q)), Array(4).fill(false));
check("search: the same for 3 and up, with the number", [finds(beans(3), "3 day"), finds(beans(3), "three-day"), finds(beans(3), "2 day"), finds(beans(3), "two day"),
  finds(beans(12), "12-day recipe"), finds(beans(12), "twelve day"), finds(beans(14), "fourteen days")], [true, true, false, false, true, true, true]);
check("search: a same-day recipe is not found by them", ["2 day", "two day", "day", "two"].map((q) => finds(beans(undefined), q)), Array(4).fill(false));
check("search: the word recipe leaves the list as it was, tagged or not", [finds(beans(2), "recipe"), finds(beans(undefined), "recipes"), narrow(data.recipes, { query: "recipe" }).length], [true, true, data.recipes.length]);
check("search on the real recipes: 2 day, 2-day, two day and the tag typed whole each find the larp",
  ["2 day", "2-day", "two day", "2-day recipe"].map((q) => narrow(data.recipes, { query: q }).some((x) => x.id === larp.id)), Array(4).fill(true));
check("search: a word that is only in a step finds nothing, because steps are not searched",
  finds({ ...beans(2), steps: [{ section: "", items: ["Soak the beans overnight."] }] }, "overnight"), false);

// The word "recipe" is never put among a recipe's own words, so its first letters do not match every recipe.
const rice = { title: "Red Rice", section: "Grub", tags: [], ingredients: [{ section: "", items: [{ qty: "1", unit: "cup", name: "rice", note: "" }] }] };
const toast = { title: "Toast", section: "Brekky", tags: [], ingredients: [{ section: "", items: [{ qty: "2", unit: "slices", name: "bread", note: "" }] }] };
const soaked = { ...beans(2), title: "Soaked Beans" };
const pantry = [rice, toast, soaked];
const found = (typed) => narrow(pantry, { query: typed }).map((x) => x.title);
check("search: a recipe's words are its own, with no word added that every recipe would share",
  [haystack(rice), haystack(toast).includes("recipes"), haystack(soaked).includes("recipes")], [["red", "rice", "grub", "rice"], false, false]);
check("search: r and re narrow the list like any other letters", [found("r"), found("re"), found("b")], [["Red Rice"], ["Red Rice"], ["Toast", "Soaked Beans"]]);
check("search: the word recipe, and its first three letters or more, leave the list whole", ["rec", "reci", "recip", "recipe", "recipes", "RECIPE"].map((q) => found(q).length), Array(6).fill(3));
check("search: so the tag typed whole finds the tagged recipe at every letter on the way", ["2-day r", "2-day re", "2-day rec", "2-day recip", "2-day recipe", "2-day recipes"].map(found),
  [[], [], ["Soaked Beans"], ["Soaked Beans"], ["Soaked Beans"], ["Soaked Beans"]]);
check("search: the word beside another still narrows by the other", [found("rice recipe"), found("toast recipes"), found("recipe zzz")], [["Red Rice"], ["Toast"], []]);
check("search: a longer word that only starts the same way is searched for as it is", [found("recipez"), found("recipess"), matches(["recipezine"], "recipez")], [[], [], true]);

// Browse: one more Time choice, and the short-time choices never show a recipe that needs more than one day
const mixed = [{ id: "quick", title: "Quick", total_minutes: 20, ingredients: [] }, { id: "soak", title: "Soak", total_minutes: 20, days: 2, ingredients: [] },
  { id: "hour", title: "Hour", total_minutes: 60, ingredients: [] }, { id: "long", title: "Long", total_minutes: 4000, days: 3, ingredients: [] },
  { id: "slow", title: "Slow", total_minutes: 900, ingredients: [] }];
check("browse times: the new choice comes after the ones that were there", BROWSE_TIMES, [[0, "Any"], [30, "30 minutes or less"], [60, "An hour or less"], ["days", "Two days or more"]]);
check("narrow: Two days or more is the recipes whose days say so", narrow(mixed, { minDays: 2 }).map((x) => x.id), ["soak", "long"]);
check("narrow: 30 minutes or less and An hour or less never show a recipe with days, however short its total",
  [narrow(mixed, { maxMinutes: 30 }).map((x) => x.id), narrow(mixed, { maxMinutes: 60 }).map((x) => x.id)], [["quick"], ["quick", "hour"]]);
check("narrow: days with a chapter and with words", [narrow(mixed, { minDays: 2, query: "lon" }).map((x) => x.id), narrow(mixed, { minDays: 2, chapter: "Grub" }).map((x) => x.id)], [["long"], []]);
check("narrow on the real recipes: Two days or more lists the larp and only recipes that carry the tag, and An hour or less lists none that do",
  [narrow(data.recipes, { minDays: 2 }).some((x) => x.id === larp.id), narrow(data.recipes, { minDays: 2 }).every((x) => daysLabel(x)), narrow(data.recipes, { maxMinutes: 60 }).some((x) => daysLabel(x))], [true, true, false]);
check("browse state: the days choice is read from the address", stateOf("time=days"), { query: "", chapter: "", maxMinutes: 0, minDays: 2 });
check("browse state: anything else under time is off", [stateOf("time=Days"), stateOf("time=2"), stateOf("time=0")], Array(3).fill({ query: "", chapter: "", maxMinutes: 0, minDays: 0 }));
check("browse address: the days choice", [browseHash({ minDays: 2 }), browseHash({ chapter: "Grub", query: "rice", minDays: 2 })], ["#/browse?time=days", "#/browse?chapter=Grub&q=rice&time=days"]);
check("browse address and back, with the days choice", browseState(parseRoute(browseHash({ query: "rice", chapter: "Grub", maxMinutes: 0, minDays: 2 })).query, chaptersNow),
  { query: "rice", chapter: "Grub", maxMinutes: 0, minDays: 2 });
check("time choice: one at a time", [timePicked(0), timePicked(30), timePicked("days"), timeChoice(timePicked(60)), timeChoice(timePicked("days")), timeChoice(timePicked(0)), timeChoice()],
  [{ maxMinutes: 0, minDays: 0 }, { maxMinutes: 30, minDays: 0 }, { maxMinutes: 0, minDays: 2 }, 60, "days", 0, 0]);

// the form: the days box into the recipe file and back
check("days box: read as a number, 1 for the same day", ["", "2", " 3 ", "14", "15", "1", "0", "2.5", "abc", null, undefined, 7].map(daysFromField), [1, 2, 3, 14, 1, 1, 1, 1, 1, 1, 1, 7]);
check("days box: written from a number", [1, 2, 14, 15, undefined, "3", 2.5].map(daysField), ["", "2", "14", "", "", "", ""]);
check("days box: how the control names them", [daysWords(1), daysWords(2), daysWords(14)], ["Same day", "2 days", "14 days"]);
check("fields from a recipe: the days", [fieldsFromRecipe(larp).days, fieldsFromRecipe(padThai).days, emptyFields().days], ["2", "", ""]);
const larpBack = recipeFromDraft(draftFromRecipe(larp, "d1", 0), NOW);
check("round trip with days: the larp comes back with its days, in the place the file has it", [larpBack.days, Object.keys(larpBack).join(" "), JSON.stringify(larpBack) === JSON.stringify(clean(larp))],
  [2, "schema id version created updated title section headnote yield time_text total_minutes total_minutes_estimated active_minutes days tags ingredients steps", true]);
check("round trip with days: the built data carries the field for the larp, and no recipe carries it for the same day", [larp.days, data.recipes.filter((x) => "days" in x && daysOf(x) === 1).map((x) => x.id)], [2, []]);
const soak = { id: "d20", touched: 0, separate: false, fields: { ...fresh.fields, hours: "14", minutes: "", days: "2" } };
check("a new draft set to 2 days: the file says so, after the total time", [recipeFromDraft(soak, NOW).days, recipeFromDraft(soak, NOW).total_minutes, Object.keys(recipeFromDraft(soak, NOW)).join(" "), draftProblems(soak)],
  [2, 840, "schema id version created updated title section source headnote yield time_text total_minutes days tags ingredients steps notes", []]);
check("a same-day draft leaves days out of the file", ["days" in recipeFromDraft(fresh, NOW), "days" in recipeFromDraft({ ...soak, fields: { ...soak.fields, days: "1" } }, NOW),
  "days" in recipeFromDraft({ ...soak, fields: { ...soak.fields, days: "15" } }, NOW)], [false, false, false]);
check("the recipe file of a 2-day draft reads back with its days", JSON.parse(recipeFileText(recipeFromDraft(soak, NOW))).days, 2);
const D = (hours, days) => ({ id: "d21", fields: { ...fresh.fields, hours, minutes: "", days } });
check("too few days for the time is refused in plain words", [draftProblems(D("24", "")), draftProblems(D("50", "2")), draftProblems(D("336", "13"))], [
  ["The total time is 24 hours or more, so this recipe needs at least 2 days. Under Days it needs, pick 2 days or more."],
  ["The total time is 48 hours or more, so this recipe needs at least 3 days. Under Days it needs, pick 3 days or more."],
  ["The total time is 312 hours or more, so this recipe needs at least 14 days. Under Days it needs, pick 14 days."]]);
check("enough days is not, and under 24 hours any number of days is the writer's call",
  [draftProblems(D("24", "2")), draftProblems(D("24", "5")), draftProblems(D("50", "3")), draftProblems(D("336", "14")), draftProblems(D("14", "2")), draftProblems(D("14", ""))], Array(6).fill([]));
check("the days line on its own", [daysProblem({ hours: "23", minutes: "59", days: "" }), daysProblem({ hours: "24", minutes: "", days: "" }).startsWith("The total time is 24 hours or more"),
  daysProblem({ hours: "abc", minutes: "", days: "" })], ["", true, ""]);
check("a total time that is itself wrong is said, without a days line on top", draftProblems(D("400", "")), ["The total time can be two weeks at most."]);
const daysCopy = draftFromRecipe(larp, "d22", 0);
daysCopy.fields.days = "3";
check("a copy with only its days changed is a changed copy, the next version", [draftChanged(daysCopy), nothingToKeep(daysCopy), recipeFromDraft(daysCopy, NOW).days, recipeFromDraft(daysCopy, NOW).version], [true, false, 3, larp.version + 1]);
daysCopy.fields.days = "";
check("and a day-long copy set back to Same day is refused", draftProblems(daysCopy), ["The total time is 24 hours or more, so this recipe needs at least 2 days. Under Days it needs, pick 2 days or more."]);
const oldDraft = cleanDraft({ id: "d23", touched: 1, fields: { title: "Old", hours: "1" } });
check("a draft kept before days existed reads as a same-day draft", [oldDraft.fields.days, "days" in recipeFromDraft(oldDraft, NOW)], ["", false]);
check("a days box holding something else from the device is the same day", "days" in recipeFromDraft(cleanDraft({ id: "d24", fields: { title: "Odd", days: "lots" } }), NOW), false);

/* ---------- sixth version: what the three reviews of the fifth found ---------- */

// pasted lists: a list number is one or two digits; a year or an oven heat that starts a sentence stays
check("tips: a line that starts with a year or an oven heat and a full stop keeps the number",
  parseTips("1985. The year nana wrote this down.\n350. No hotter than that.\n100) is a lot of dumplings\n2019 was a good year for this\n350 degrees. No hotter."),
  ["1985. The year nana wrote this down.", "350. No hotter than that.", "100) is a lot of dumplings", "2019 was a good year for this", "350 degrees. No hotter."]);
check("steps: the same", parseSteps("350. No hotter.\n1985. Nana's year.\n1.5 hours in the fridge\n3-4 days in the fridge")[0].items,
  ["350. No hotter.", "1985. Nana's year.", "1.5 hours in the fridge", "3-4 days in the fridge"]);
check("list numbers up to 99 still come off, for tips and for steps",
  [parseTips("1. One\n9) Nine\n10. Ten\n99. Ninety-nine"), parseSteps("1. One\n12) Twelve\n99. Ninety-nine")[0].items],
  [["One", "Nine", "Ten", "Ninety-nine"], ["One", "Twelve", "Ninety-nine"]]);

// a total time beside the tag is counted in hours: "1 day" next to "2-day recipe" reads as one day against two
check("total text: a same-day recipe's time reads as before", [totalText(20), totalText(60), totalText(205), totalText(1440), totalText(1500, 1)], ["20 minutes", "1 hour", "3 hours 25 minutes", "1 day", "1 day 1 hour"]);
check("total text: with 2 days or more it is counted in hours", [totalText(1440, 2), totalText(1500, 2), totalText(840, 2), totalText(2970, 3), totalText(20, 2), totalText(60, 2), totalText(61, 2), totalText(MAX_MINUTES, 14)],
  ["24 hours", "25 hours", "14 hours", "49 hours 30 minutes", "20 minutes", "1 hour", "1 hour 1 minute", "336 hours"]);
const dayLong = { total_minutes: 1440, total_minutes_estimated: true, days: 2 };
check("short time: a tagged recipe never says a number of days beside its tag", [shortTime(dayLong), shortTime({ total_minutes: 4000, days: 3 }), shortTime({ ...dayLong, days: undefined })], ["about 24 hours", "66 hours 40 minutes", "about 1 day"]);
check("time facts: the same on the recipe page", [timeFacts(dayLong), timeFacts({ ...dayLong, time_text: "a day" }).guess, timeFacts({ total_minutes: 1440, days: 2 }).ready],
  [{ ready: "Ready in about 24 hours", guess: "The total time is a guess. Plans count it as 24 hours, and you can change that in Prep." },
    "The total time is a guess. Plans count it as 24 hours, and you can change that in Prep.", "Ready in 24 hours"]);
check("the larp's own count is in hours, in the list and on its page", [shortTime(larp).endsWith(totalText(larp.total_minutes, larp.days)), /\d days?\b/.test(shortTime(larp)), /\d days?\b/.test(timeFacts(larp).guess)],
  [true, false, false]);

// a changed copy is numbered from the later of its own version and the site's, so it is never handed over as a
// version the site already has
const stale = draftFromRecipe({ ...padThai, version: 3 }, "d30", 0);
check("an unchanged copy keeps the version it was copied at, whatever the site has", [recipeFromDraft(stale, NOW).version, recipeFromDraft(stale, NOW, 5).version, recipeFromDraft(stale, NOW, 3).version], [3, 3, 3]);
stale.fields.headnote = "Changed.";
check("a changed copy is the version after its own when the site has not moved on", [recipeFromDraft(stale, NOW).version, recipeFromDraft(stale, NOW, 3).version, recipeFromDraft(stale, NOW, 0).version, recipeFromDraft(stale, NOW, 1).version], [4, 4, 4, 4]);
check("a changed copy of a version the site has left behind is the version after the site's", [recipeFromDraft(stale, NOW, 4).version, recipeFromDraft(stale, NOW, 9).version], [5, 10]);
check("a site version that is not a whole number is not counted", [recipeFromDraft(stale, NOW, "9").version, recipeFromDraft(stale, NOW, NaN).version, recipeFromDraft(stale, NOW, null).version], [4, 4, 4]);
stale.separate = true;
check("a separate recipe starts at version 1 whatever the site has", recipeFromDraft(stale, NOW, 9).version, 1);

// every address the site's own files ask for is relative, the test pages included (the site lives in a folder
// of its own, so an address that starts at the server's root would leave it)
const rooted = [];
const everyFile = site.all ? site.all : site.files.concat(["tests/index.html", "tests/tests.js", "tests/flows.html", "tests/flows.js", "tests/flows-run.js", "tests/local-only.js"]);
for (const name of everyFile.filter((x) => /\.(js|html|css|webmanifest)$/.test(x) && !x.startsWith("tests/zz-"))) {
  const text = await fetch("../" + name).then((x) => (x.ok ? x.text() : ""));
  for (const [what, shape] of [["a fetch from the root", /fetch\(\s*["'`]\//], ["an import from the root", /(?:from|import)\s*\(?\s*["'`]\//], ["a link or file from the root", /\b(?:href|src|action)\s*=\s*["']\//], ["a style file from the root", /url\(\s*["']?\//]]) {
    if (shape.test(text)) rooted.push(name + " has " + what);
  }
}
check("no file of the site or its tests asks for an address that starts at the server's root", [rooted, everyFile.includes("tests/tests.js") && everyFile.includes("js/app.js")], [[], true]);

// one PDF per recipe: the folder holds the file each recipe links to and no older version of any
if (site.how === "every file in the folder") {
  const pdfs = site.files.filter((x) => x.startsWith("pdf/") && x.endsWith(".pdf")).sort();
  check("the pdf folder holds nothing left over from an earlier version (first list), and every recipe has its own PDF there (second list names any that needs tools/make_pdf.py run on it)",
    [pdfs.filter((x) => !data.recipes.some((r) => r.pdf === x)), data.recipes.filter((r) => !pdfs.includes(r.pdf)).map((r) => r.id)], [[], []]);
} else {
  say("info the pdf folder was not listed (this page was not opened through tools/run_tests.py), so left-over PDFs were not looked for");
}

/* ---------- sixth version: his own recipes, kept on this device beside the cookbook's ---------- */

const mine1 = (over = {}) => ({ schema: 1, id: "my--toast", version: 1, created: NOW, updated: NOW, title: "Toast", total_minutes: 5, tags: [],
  ingredients: [{ section: "", items: [{ qty: "1", unit: "slice", name: "bread", note: "" }] }], steps: [{ section: "", items: ["Toast it."] }], ...over });
const gate = (x) => own.cleanRecipe(x, NOW);

// addresses: a cookbook id never has "--", so "my--" and a plain id can never be one, now or later
check("own ids: a plain id is the cookbook's own shape, 60 characters at most",
  ["toast", "a-b-2", "a--b", "-a", "a-", "A", "", "x".repeat(60), "x".repeat(61), 5, null].map(own.isPlainId),
  [true, true, false, false, false, false, false, true, false, false, false]);
check("own ids: his addresses are my-- and a plain id", ["my--toast", "my--", "my---toast", "my--a--b", "my--" + "x".repeat(60), "my--" + "x".repeat(61), "toast", "my-toast"].map(own.isOwnId),
  [true, false, false, false, true, false, false, false]);
check("own ids: the plain part", [own.plainId("my--toast"), own.plainId("toast"), own.plainId("my--a--b")], ["toast", "toast", "my--a--b"]);
check("own ids: no cookbook id and no title's slug could ever be one of his addresses",
  [data.recipes.filter((x) => !own.isPlainId(x.id) || own.isOwnId(x.id)).map((x) => x.id), data.recipes.filter((x) => !own.isPlainId(slug(x.title))).map((x) => x.id),
    [slug("Toast -- for two"), slug("my--toast"), slug("My -- Toast")]],
  [[], [], ["toast-for-two", "my-toast", "my-toast"]]);
check("own ids: the address of one of his opens a recipe page", parseRoute("#/r/my--toast").name + " " + parseRoute("#/r/my--toast").arg, "recipe my--toast");
const sixty = "x".repeat(60);
check("own ids: the first free address, then -2, -3; a long one is cut to fit; one with nothing plain is a recipe",
  [own.freeOwnId("toast", []), own.freeOwnId("toast", ["my--toast"]), own.freeOwnId("toast", ["my--toast", "my--toast-2"]),
    own.freeOwnId(sixty, ["my--" + sixty]), own.isOwnId(own.freeOwnId(sixty, ["my--" + sixty])), own.freeOwnId("", []), own.freeOwnId("Not An Id", ["my--recipe"])],
  ["my--toast", "my--toast-2", "my--toast-3", "my--" + "x".repeat(58) + "-2", true, "my--recipe", "my--recipe-2"]);
check("own ids: a cut that would end on a hyphen does not", own.freeOwnId("x".repeat(57) + "-yy", ["my--" + "x".repeat(57) + "-yy"]), "my--" + "x".repeat(57) + "-2");

// the gate: every cookbook recipe comes through it word for word, so the limits are far above anything real
check("gate: every cookbook recipe comes through word for word (only the address and the PDF are left behind)",
  data.recipes.filter((x) => JSON.stringify(gate(x).recipe) !== JSON.stringify({ ...clean(x), id: "" })).map((x) => x.id), []);
check("gate: one of his comes through as it is, in the files' key order", JSON.stringify(gate(mine1({ base: "pad-thai-baby" })).recipe), JSON.stringify(mine1({ base: "pad-thai-baby" })));
const proto = Object.create({ title: "Inherited", total_minutes: 5, ingredients: mine1().ingredients, steps: mine1().steps });
check("gate: only a value's own fields are read", gate(proto).problems, [own.NO_TITLE, own.NO_TIME, own.NO_INGREDIENT, own.NO_STEP]);
const sneaky = gate(JSON.parse("{\"__proto__\": {\"polluted\": true}, \"title\": \"Toast\", \"total_minutes\": 5, \"ingredients\": [{\"section\": \"\", \"items\": [{\"name\": \"bread\"}]}], \"steps\": [{\"section\": \"\", \"items\": [\"Toast it.\"]}], \"pdf\": \"pdf/x-v1.pdf\", \"own\": true, \"_words\": [\"x\"], \"evil\": 1}")).recipe;
check("gate: a new object of the named fields only: no pdf, own, _words or any other key, and nothing from __proto__",
  [Object.keys(sneaky), Object.getPrototypeOf(sneaky) === Object.prototype, ({}).polluted, sneaky.polluted, sneaky.ingredients[0].items[0]],
  [["schema", "id", "version", "created", "updated", "title", "total_minutes", "tags", "ingredients", "steps"], true, undefined, undefined, { qty: "", unit: "", name: "bread", note: "" }]);
check("gate: a value that is not a recipe object", [gate(null), gate([]), gate("Toast"), gate(5)].map((x) => [x.recipe, x.problems]), Array(4).fill([null, [own.NOT_A_FILE]]));
check("gate: what is missing is said in plain sentences, all at once", gate({ title: "  " }).problems, [own.NO_TITLE, own.NO_TIME, own.NO_INGREDIENT, own.NO_STEP]);
check("gate: a total time must be a whole number of minutes from 1 up to two weeks",
  [0, -5, 1.5, "50", MAX_MINUTES + 1, null].map((n) => gate(mine1({ total_minutes: n })).problems), Array(6).fill([own.NO_TIME]));
check("gate: two weeks is fine", gate(mine1({ total_minutes: MAX_MINUTES, days: MAX_DAYS })).recipe.total_minutes, MAX_MINUTES);
check("gate: a later recipe format is not read, and a format that is not a number is not a recipe file",
  [gate(mine1({ schema: 2 })).problems, gate(mine1({ schema: "1" })).problems, gate(mine1({ schema: 1 })).problems], [[own.NEWER_FORMAT], [own.NOT_A_FILE], []]);
check("gate: control characters become a space and direction marks go, in every line of text",
  [gate(mine1({ title: " A\u0000B C‮D⁦E " })).recipe.title, gate(mine1({ steps: [{ section: "Now\u0007", items: ["Go\u001b go"] }] })).recipe.steps],
  ["A B CDE", [{ section: "Now", items: ["Go  go"] }]]);
check("gate: the headnote keeps its line breaks", gate(mine1({ headnote: "one\ntwo\r\nthree\rfour\u0000five" })).recipe.headnote, "one\ntwo\nthree\nfour five");
check("gate: empty lines, empty items and items with no name go; an empty group goes",
  gate(mine1({ tags: ["a", " ", 5], ingredients: [{ section: "", items: [{ name: " " }, "x", { qty: "1", name: "egg" }] }, { section: "Empty", items: [] }], notes: ["", "Tip"] })).recipe,
  { ...mine1(), tags: ["a"], ingredients: [{ section: "", items: [{ qty: "1", unit: "", name: "egg", note: "" }] }], notes: ["Tip"] });
check("gate: a joke line counts as an ingredient, as it does in Draft and in tools/build.py",
  gate(mine1({ ingredients: [{ section: "", items: [{ name: "a toaster", aside: true }] }] })).recipe.ingredients, [{ section: "", items: [{ qty: "", unit: "", name: "a toaster", note: "", aside: true }] }]);
check("gate: the days are raised to what the time needs, and a number of days out of range counts as the same day",
  [gate(mine1({ total_minutes: 2000 })).recipe.days, gate(mine1({ total_minutes: 5, days: 20 })).recipe.days, gate(mine1({ total_minutes: 5, days: 3 })).recipe.days],
  [2, undefined, 3]);
check("gate: hands-on time longer than the total is left out; a guess stays a guess only when it says true",
  [gate(mine1({ active_minutes: 9 })).recipe.active_minutes, gate(mine1({ active_minutes: 4 })).recipe.active_minutes,
    gate(mine1({ total_minutes_estimated: true })).recipe.total_minutes_estimated, gate(mine1({ total_minutes_estimated: "yes" })).recipe.total_minutes_estimated],
  [undefined, 4, true, undefined]);
check("gate: the address is kept only when it is one of his; base only when it is a plain id",
  [gate(mine1({ id: "toast" })).recipe.id, gate(mine1({ id: "my--a--b" })).recipe.id, gate(mine1({ base: "my--x" })).recipe.base, gate(mine1({ base: "../x" })).recipe.base, gate(mine1({ base: "pad-thai-baby" })).recipe.base],
  ["", "", undefined, undefined, "pad-thai-baby"]);
check("gate: a version that is not a whole number from 1 is version 1; a date that is not a date is now",
  [gate(mine1({ version: 0 })).recipe.version, gate(mine1({ version: 1e7 })).recipe.version, gate(mine1({ version: 3 })).recipe.version,
    gate(mine1({ created: "yesterday", updated: "2030-02-30T00:00:00Z" })).recipe.created, gate(mine1({ created: "2029-12-31T00:00:00Z" })).recipe.created],
  [1, 1, 3, NOW, "2029-12-31T00:00:00Z"]);
check("gate: anything over a limit is refused, never cut short",
  [gate(mine1({ title: "t".repeat(201) })), gate(mine1({ headnote: "h".repeat(2001) })), gate(mine1({ steps: [{ section: "", items: Array(201).fill("Stir.") }] })),
    gate(mine1({ tags: Array(31).fill("tag") }))].map((x) => [x.recipe, x.problems]),
  [[null, ["The title is too long. The most the site keeps is 200 characters."]], [null, ["The headnote is too long. The most the site keeps is 2,000 characters."]],
    [null, ["There are too many steps. The most the site keeps is 200."]], [null, ["There are too many tags. The most the site keeps is 30."]]]);
check("gate: right at the limits is fine", gate(mine1({ title: "t".repeat(200), steps: [{ section: "", items: Array(200).fill("Stir.") }] })).problems, []);
const huge = gate(mine1({ ingredients: [{ section: "", items: Array(300).fill({ qty: "", unit: "", name: "n".repeat(300), note: "o".repeat(300) }) }] }));
check("gate: a recipe whose file would be over 200,000 characters is refused", [huge.recipe, huge.problems], [null, [own.TOO_LONG]]);
// Right at the size limit. It is measured in the longest form a recipe can take (kept at the longest address
// with the longest base), so one that passes still fits wherever it is kept, and its recipe file loads back.
const longestForm = (r) => JSON.stringify({ ...r, id: own.OWN_MARK + "x".repeat(own.MAX_ID), base: "x".repeat(own.MAX_ID) }, null, 2).length + 1;
function atSize(n) {
  const r = mine1({ id: "", ingredients: [{ section: "", items: Array.from({ length: 300 }, () => ({ qty: "", unit: "", name: "n".repeat(300), note: "" })) }],
    notes: Array.from({ length: own.LIMITS.notes }, () => "t".repeat(own.LIMITS.tip)) });
  let over = longestForm(r) - n; // too long as made; the tips are cut, the last first, until it is exactly n
  for (let i = r.notes.length - 1; over > 0 && i >= 0; i -= 1) { const cut = Math.min(over, r.notes[i].length - 1); r.notes[i] = r.notes[i].slice(cut); over -= cut; }
  return r;
}
const atLimit = atSize(own.MAX_FILE_CHARS);
const atLimitKept = own.withRecipe([], atLimit, { wanted: "y".repeat(own.MAX_ID) });
const atLimitBase = own.withRecipe([], { ...atLimit, base: "z".repeat(own.MAX_ID) }, { wanted: "z".repeat(own.MAX_ID) });
check("gate: at the limit in its longest form it passes, is kept at the longest address and with the longest base, and its recipe file loads back",
  [longestForm(atLimit), gate(atLimit).problems, atLimitKept.problem, atLimitKept.id.length, atLimitBase.problem,
    own.readRecipeFile(recipeFileText(own.recipeFileOf(atLimitKept.list[0])), NOW).problems, own.readRecipeFile(recipeFileText(own.recipeFileOf(atLimitBase.list[0])), NOW).problems],
  [own.MAX_FILE_CHARS, [], undefined, own.OWN_MARK.length + own.MAX_ID, undefined, [], []]);
check("gate: one character more is refused for its length, before anything is kept, whatever address it would get",
  [gate(atSize(own.MAX_FILE_CHARS + 1)).problems, own.readRecipeFile(JSON.stringify(atSize(own.MAX_FILE_CHARS + 1), null, 2), NOW).problems], [[own.TOO_LONG], [own.TOO_LONG]]);

// the stored list: what a page may use of it
const list205 = Array.from({ length: 205 }, (_, n) => mine1({ id: "my--t" + n }));
check("stored list: damaged entries, entries without one of his addresses and repeats are dropped; the rest keep their order",
  own.cleanMine([mine1(), { junk: true }, mine1({ id: "toast" }), mine1({ title: "Second" }), mine1({ id: "my--b", title: "B" }), null]).map((x) => [x.id, x.title]),
  [["my--toast", "Toast"], ["my--b", "B"]]);
check("stored list: at most 200, and not a list is none", [own.cleanMine(list205).length, own.cleanMine(list205)[199].id, own.cleanMine({}), own.cleanMine("x")], [own.MAX_OWN, "my--t199", [], []]);
check("stored list: a date that is not a date reads as long ago, not as now", own.cleanMine([mine1({ created: "soon" })])[0].created, "1970-01-01T00:00:00Z");

// the same words: what a reader sees, not the address, version, dates or base
const asMine = { ...clean(padThai), id: "my--pad-thai-baby", version: 9, created: NOW, updated: NOW, base: "pad-thai-baby" };
check("same words: an address, a version, dates and a base do not count", own.sameWords(asMine, padThai), true);
check("same words: a field left out reads as an empty one, and spaces at the ends do not count",
  [own.sameWords(mine1({ notes: [] }), mine1()), own.sameWords(mine1({ title: " Toast " }), mine1())], [true, true]);
check("same words: one changed step, tag, or amount is different",
  [own.sameWords(asMine, { ...asMine, steps: [{ section: "", items: ["Other."] }] }), own.sameWords(asMine, { ...asMine, tags: [] }), own.sameWords(mine1(), mine1({ total_minutes: 6 }))], [false, false, false]);
check("same words: something that is not a recipe is never the same", [own.wordsKey(null), own.sameWords(null, null), own.sameWords({}, {})], [null, false, false]);
// The cookbook recipe with the same words is found by its words, not its address: a copy under another id or
// title (a recipe whose id is not its title's slug, a file that gives an id of its own) is still the same recipe.
const otherId = data.recipes.find((x) => slug(x.title) !== x.id) || padThai;
check("same words in a list: found whatever address it is under; none when nothing matches",
  [data.recipes.map((x) => own.sameWordsIn({ ...clean(x), id: "my--a-copy-of-it", base: "" }, data.recipes).id).every((id, n) => id === data.recipes[n].id),
    own.sameWordsIn({ ...clean(otherId), id: "" }, data.recipes).id, own.sameWordsIn(mine1(), data.recipes), own.sameWordsIn(null, data.recipes), own.sameWordsIn(mine1(), [])],
  [true, otherId.id, null, null, null]);
check("twin: the cookbook recipe it stands beside, by its base, else by its plain address",
  [own.twinOf({ id: "my--x", base: "pad-thai-baby" }, data.recipes).id, own.twinOf({ id: "my--pad-thai-baby" }, data.recipes).id, own.twinOf({ id: "my--no-such-thing-here" }, data.recipes)],
  ["pad-thai-baby", "pad-thai-baby", null]);

// the recipe file of one of his: what tools/build.py takes into recipes/ as it is
const fileOf = own.recipeFileOf({ ...asMine, own: true, _words: ["x"], pdf: "pdf/x-v1.pdf" });
check("recipe file: the id is its base, else the plain part of its address; base, own, _words and pdf stay out; the key order is the files'",
  [fileOf.id, Object.keys(fileOf).join(","), own.recipeFileOf(mine1()).id, recipeFileName(own.recipeFileOf(mine1()))],
  ["pad-thai-baby", Object.keys(clean(padThai)).join(","), "toast", "toast.json"]);
check("recipe file: read back, it is the same recipe", own.sameWords(own.readRecipeFile(recipeFileText(fileOf), NOW).recipe, padThai), true);

// reading a recipe file, loaded or pasted: never throws, and the id in it is never an address
const readBack = own.readRecipeFile(recipeFileText(clean(padThai)), NOW);
check("read file: a cookbook recipe file, which asks for the cookbook's id; base and address are never taken from a file",
  [readBack.problems, readBack.wanted, readBack.recipe.id, readBack.recipe.base, readBack.recipe.title],
  [[], "pad-thai-baby", "", undefined, padThai.title]);
check("read file: a byte order mark at the start is fine", own.readRecipeFile("﻿" + recipeFileText(mine1()), NOW).wanted, "toast");
check("read file: what it asks for: a plain id, the plain part of one of his addresses, else the title's slug",
  [own.readRecipeFile(JSON.stringify(mine1({ id: "my--toast-2", base: "pad-thai-baby" })), NOW), own.readRecipeFile(JSON.stringify(mine1({ id: "../../evil", title: "Good Toast" })), NOW),
    own.readRecipeFile(JSON.stringify(mine1({ id: 5, title: "Toast & Jam" })), NOW)].map((x) => [x.wanted, x.recipe.base]),
  [["toast-2", undefined], ["good-toast", undefined], ["toast-and-jam", undefined]]);
check("read file: refused, in plain words",
  ["not json", "null", "[]", "[{}]", "{\"recipes\": []}", JSON.stringify(mine1({ schema: 2 })), "x".repeat(own.MAX_FILE_CHARS + 1), 5, JSON.stringify({ title: "Toast" })]
    .map((t) => { const x = own.readRecipeFile(t, NOW); return [x.recipe, x.problems.join(" ")]; }),
  [[null, own.NOT_A_FILE], [null, own.NOT_A_FILE], [null, own.MORE_THAN_ONE], [null, own.MORE_THAN_ONE], [null, own.MORE_THAN_ONE], [null, own.NEWER_FORMAT], [null, own.TOO_BIG], [null, own.TOO_BIG],
    [null, [own.NO_TIME, own.NO_INGREDIENT, own.NO_STEP].join(" ")]]);
check("read file: the sentences", [own.TOO_BIG, own.NOT_A_FILE, own.MORE_THAN_ONE, own.NEWER_FORMAT],
  ["It is too big to be a recipe file. The most is 200,000 characters.", "It is not a recipe file from this site.", "It holds more than one recipe. Load one recipe file at a time.",
    "It is in a newer recipe format than this page knows. Reload the page and try again."]);

// putting one into the list: a new one at the top at the first free address; a changed one in its place
const w1 = own.withRecipe([], mine1({ id: "" }), { wanted: "toast" });
const w2 = own.withRecipe(w1.list, mine1({ id: "my--elsewhere", title: "Toast 2" }), { wanted: "toast" });
const w3 = own.withRecipe(w2.list, mine1({ version: 2, title: "Toast, again" }), { replace: "my--toast" });
check("with recipe: added at the top at the first free address, never over another; the id it brings is not used",
  [w1.id, w2.id, w2.list.map((x) => x.id)], ["my--toast", "my--toast-2", ["my--toast-2", "my--toast"]]);
check("with recipe: a changed one stays at its address and in its place", [w3.id, w3.list.map((x) => [x.id, x.title, x.version])], ["my--toast", [["my--toast-2", "Toast 2", 1], ["my--toast", "Toast, again", 2]]]);
check("with recipe: the list given is not changed", w1.list.map((x) => x.id), ["my--toast"]);
const full200 = own.cleanMine(list205);
check("with recipe: no new one past 200, but one of the 200 can still change; something that is not a recipe is refused",
  [own.withRecipe(full200, mine1(), { wanted: "new" }).problem, own.withRecipe(full200, mine1({ title: "Changed" }), { replace: "my--t3" }).list[3].title, own.withRecipe([], { title: "x" }, { wanted: "x" }).problem],
  ["many", "Changed", "bad"]);

// the join: the one place the cookbook and his recipes meet
const book = { sections: data.sections, recipes: data.recipes };
const joined = own.joinData(book, [mine1({ id: "my--zed", title: "Zed" }), mine1({ id: "my--apple", title: "apple" }), mine1({ id: "my--apple", title: "Again" })]);
check("join: the cookbook first, the very same objects in the build's order, then his by title; each address once",
  [joined.recipes.slice(0, data.recipes.length).every((x, n) => x === data.recipes[n]), joined.recipes.slice(data.recipes.length).map((x) => x.id), joined.book.length === data.recipes.length, joined.sections === data.sections],
  [true, ["my--apple", "my--zed"], true, true]);
check("join: his are marked as his and found by the word yours; the lists given are not changed",
  [joined.recipes.filter((x) => x.own === true).length, narrow(joined.recipes, { query: "yours" }).filter((x) => x.own === true).map((x) => x.id),
    joined.recipes.filter((x) => x.own === true).every((x) => x._words.includes("yours") && x._words.includes("bread")), data.recipes.some((x) => "own" in x), "own" in mine1()],
  [2, ["my--apple", "my--zed"], true, false, false]);
check("join: a cookbook recipe never takes one of his addresses, and nothing is there twice",
  own.joinData({ sections: [], recipes: [{ ...padThai, id: "my--toast" }, padThai, padThai] }, [mine1()]).recipes.map((x) => [x.id, x.own === true]),
  [["pad-thai-baby", false], ["my--toast", true]]);
check("join: with none of his, the site is the cookbook", own.joinData(book, []).recipes.length === data.recipes.length && own.joinData(book, null).recipes.length === data.recipes.length, true);

// what Add to your recipes keeps from a draft
const toastDraft = { id: "d40", touched: 0, separate: false, fields: { ...emptyFields(), title: "Test Toast", minutes: "50", ingredients: "2 slices bread", steps: "Toast it." } };
const fromNew = own.ownFromDraft(toastDraft, NOW, data.recipes, []);
check("from draft: a new one asks for its title's slug, version 1, nothing to replace",
  [fromNew.wanted, fromNew.replace, fromNew.editing, fromNew.recipe.version, fromNew.recipe.base], ["test-toast", "", false, 1, undefined]);
const sameName = own.ownFromDraft({ ...toastDraft, fields: { ...toastDraft.fields, title: padThai.title } }, NOW, data.recipes, []);
check("from draft: a new one with a cookbook recipe's title is kept beside it as his version", [sameName.wanted, sameName.recipe.base], [padThai.id, padThai.id]);
const bookCopy = draftFromRecipe(padThai, "d41", 0);
bookCopy.fields.headnote = "Mine now.";
const fromCopy = own.ownFromDraft(bookCopy, NOW, data.recipes, []);
check("from draft: a changed copy of a cookbook recipe is his version of it, one version past the cookbook's",
  [fromCopy.wanted, fromCopy.recipe.base, fromCopy.recipe.version, fromCopy.replace, fromCopy.editing], [padThai.id, padThai.id, padThai.version + 1, "", false]);
const myToast = mine1({ version: 2, base: "pad-thai-baby" });
const ownEdit = draftFromRecipe(myToast, "d42", 0);
ownEdit.fields.steps = "Toast it well.";
const fromEdit = own.ownFromDraft(ownEdit, NOW, data.recipes, [myToast]);
check("from draft: a changed draft of his own recipe replaces it, one version on, keeping its base and when it was made",
  [fromEdit.editing, fromEdit.replace, fromEdit.wanted, fromEdit.recipe.version, fromEdit.recipe.base, fromEdit.recipe.created, fromEdit.stored === myToast],
  [true, "my--toast", "toast", 3, "pad-thai-baby", NOW, true]);
check("from draft: if it changed on the device since (another tab), the next version is past that one",
  own.ownFromDraft(ownEdit, NOW, data.recipes, [{ ...myToast, version: 5 }]).recipe.version, 6);
check("from draft: marked separate, it is a new recipe from its title", [own.ownFromDraft({ ...ownEdit, separate: true }, NOW, data.recipes, [myToast])].map((x) => [x.editing, x.replace, x.wanted, x.recipe.version])[0],
  [false, "", "toast", 1]);

// the store says what happened to a write that must never be half kept
const kBox = new Map();
const kStore = makeStore({ getItem: (k) => (kBox.has(k) ? kBox.get(k) : null), setItem: (k, v) => { kBox.set(k, String(v)); }, removeItem: (k) => { kBox.delete(k); } });
check("store put: kept, and read back", [kStore.put("mine", 1, [1]), kStore.get("mine", 1, null), kStore.formatOf("mine")], ["kept", [1], 1]);
const offStore = makeStore({ getItem: broken, setItem: broken, removeItem: broken });
check("store put: storage off, held for the visit", [offStore.put("mine", 1, [2]), offStore.get("mine", 1, null), offStore.keeps()], ["visit", [2], false]);
const tightBox = new Map([["grub.mine", JSON.stringify({ v: 1, data: ["old"] })]]);
const tight = makeStore({ getItem: (k) => (tightBox.has(k) ? tightBox.get(k) : null),
  setItem: (k, v) => { if (k === "grub.mine") throw new Error("full"); tightBox.set(k, String(v)); }, removeItem: (k) => { tightBox.delete(k); } });
check("store put: no room for it, and nothing changes, not even for the visit", [tight.put("mine", 1, ["new"]), tight.get("mine", 1, null), tightBox.get("grub.mine")],
  ["full", ["old"], JSON.stringify({ v: 1, data: ["old"] })]);
// A device out of room, the way a browser is: every write that would go over the room left is refused with the
// browser's own error, the small check write too. A draft saved on every key can use up the room to the last
// character, so this is how a full device usually looks.
function roomy(left, box) {
  const used = () => [...box].reduce((n, [k, v]) => n + k.length + v.length, 0);
  const device = { getItem: (k) => (box.has(k) ? box.get(k) : null), removeItem: (k) => { box.delete(k); },
    setItem: (k, v) => {
      const was = box.has(k) ? k.length + box.get(k).length : 0;
      if (used() - was + k.length + String(v).length > device.limit) throw new DOMException("no room", "QuotaExceededError");
      box.set(k, String(v));
    } };
  device.limit = used() + left;
  return device;
}
const shared = new Map([["grub.mine", JSON.stringify({ v: 1, data: ["old"] })]]);
const deviceA = roomy(0, shared), tabA = makeStore(deviceA);
check("store put: out of room to the last character, it is full, not storage switched off: nothing changes, not even for the visit",
  [tabA.put("mine", 1, ["from tab A", "old"]), tabA.get("mine", 1, null), shared.get("grub.mine")], ["full", ["old"], JSON.stringify({ v: 1, data: ["old"] })]);
deviceA.limit = Infinity; // room again (a draft deleted), and another tab adds a recipe
shared.set("grub.mine", JSON.stringify({ v: 1, data: ["from tab B", "old"] }));
check("store put: and nothing held back from it is written later over what another tab kept meanwhile", [tabA.keeps(), tabA.get("mine", 1, null), shared.get("grub.mine")],
  [true, ["from tab B", "old"], JSON.stringify({ v: 1, data: ["from tab B", "old"] })]);
const oddQuota = (props) => makeStore({ getItem: () => null, removeItem: () => {}, setItem: () => { throw Object.assign(new Error("no room"), props); } });
check("store put: every browser's way of saying it is out of room counts as full",
  [{ name: "NS_ERROR_DOM_QUOTA_REACHED" }, { code: 22 }, { code: 1014 }].map((p) => oddQuota(p).put("mine", 1, [1])), ["full", "full", "full"]);
check("store put: a refusal that is not about room, with no write going through at all, is storage switched off", makeStore({ getItem: broken, setItem: broken, removeItem: broken }).put("mine", 1, [1]), "visit");
const readOnly = new Map([["grub.mine", JSON.stringify({ v: 1, data: ["kept before"] })]]);
const ro = makeStore({ getItem: (k) => (readOnly.has(k) ? readOnly.get(k) : null), setItem: broken, removeItem: broken });
check("store saved: what the device itself holds, apart from what is held for this visit",
  [ro.put("mine", 1, ["this visit"]), ro.get("mine", 1, null), ro.saved("mine", 1, null), ro.saved("none", 1, "fallback"), offStore.saved("mine", 1, "fallback")],
  ["visit", ["this visit"], ["kept before"], "fallback", "fallback"]);
const fmtBox = new Map([["grub.a", JSON.stringify({ v: 2, data: [] })], ["grub.b", "not json"], ["grub.c", JSON.stringify(["x"])]]);
const fmt = makeStore({ getItem: (k) => (fmtBox.has(k) ? fmtBox.get(k) : null), setItem: () => {}, removeItem: () => {} });
check("store format: a later format is seen as later; nothing stored is null; something not ours is -1",
  [fmt.formatOf("a"), fmt.formatOf("none"), fmt.formatOf("b"), fmt.formatOf("c"), fmt.get("a", 1, "fallback")], [2, null, -1, -1, "fallback"]);

// the mark's word is written in one script only, so it reads the same wherever it shows
const markFiles = [];
for (const name of site.files.filter((x) => x.endsWith(".js"))) {
  if ((await fetch("../" + name).then((x) => x.text())).includes("\"Yours\"")) markFiles.push(name);
}
check("the mark's word is written in one script only", markFiles, ["js/recipe-view.js"]);

const passed = lines.filter((x) => x.startsWith("ok")).length;
say("RESULT " + passed + " passed, " + failed + " failed");
document.title = failed ? "FAILED" : "PASSED";
