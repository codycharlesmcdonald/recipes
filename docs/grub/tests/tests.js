import { fold, slug, haystack, matches, minutesText, countText, chapterList, narrow, timeFacts, shortTime, ingredientText, amountText,
  mergedLines, shoppingLine, shortcutUrl, isoStamp, buildIcs, buildPlanIcs, icsFileName, planFileName,
  parseRoute, nameKey, browseState, browseHash, isIosDevice, storageCanLapse, pdfHref, MAX_MINUTES } from "../js/lib.js";
import { parseIngredientLine, ingredientLine, parseIngredients, parseSteps, emptyFields, fieldsFromRecipe, totalMinutes, timeProblem, fieldsBlank,
  draftFromRecipe, draftChanged, recipeFromDraft, draftProblems, recipeFileText, recipeFileName, cleanDraft } from "../js/recipe-format.js";
import { addFromRecipe, addOwn, setGot, removeItem, clearTicked, counts, groups, sendLines, realIngredients, cleanList, OWN_TITLE } from "../js/shopping-list.js";
import { emptyPlan, addToPlan, removeFromPlan, setPlanMinutes, usableMinutes, realTime, cleanPlan, planEntries, longestMinutes, planLines, startWhen,
  mealMsOf, dateValue, defaultDay, planDay } from "../js/plan.js";
import { makeStore, PREFIX } from "../js/store.js";
import { localOnly } from "./local-only.js";

const lines = [];
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed += 1;
  lines.push((ok ? "ok   " : "FAIL ") + name + (ok ? "" : "\n     got  " + JSON.stringify(got) + "\n     want " + JSON.stringify(want)));
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
check("shortcut url", shortcutUrl(["Garlic (2 cloves)", "Eggs (4)"]),
  "shortcuts://run-shortcut?name=Recipe%20Shopping&input=text&text=Garlic%20(2%20cloves)%0AEggs%20(4)");

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
check("round trip covers all twelve", data.recipes.length, 12);
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
lines.push("info " + textOnly + " of " + data.recipes.length + " recipes come back the same through the text alone; the rest need the kept items for amounts in his own words");

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
check("ticked things are not sent", sendLines(list), ["Pad Thai rice sticks (12 oz)", "Fish sauce (4 tablespoons)"]);
let again = addFromRecipe(list, padThai, realIngredients(padThai).slice(1, 2));
check("adding it again puts it back on the to-get side, once", [again.added, again.already, again.list.length, counts(again.list).got], [0, 1, 3, 0]);
again = addOwn(addFromRecipe(again.list, burgers, realIngredients(burgers).filter((x) => x.name === "garlic")).list, "  Paper   towels ");
check("the same thing from two recipes is sent once with both amounts", sendLines(again.list), ["Pad Thai rice sticks (12 oz)", "Garlic (2 cloves + 2 cloves)", "Fish sauce (4 tablespoons)", "Paper towels"]);
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
check("time facts: a guess is said to be a guess", timeFacts(larp),
  { ready: "Ready in a day", guess: "The total time is a guess. Plans count it as 1 day, and you can change that in Prep." });
check("time facts: a guess with no words of his", timeFacts({ total_minutes: 18, total_minutes_estimated: true }).ready, "Ready in about 18 minutes");
check("time facts: nothing yet", timeFacts({ total_minutes: 0 }).ready, "No total time yet");
check("short time", [shortTime(padThai), shortTime(larp)], ["1 hour", "about 1 day"]);
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
check("browse state: nothing in the address is nothing picked", stateOf(""), { query: "", chapter: "", maxMinutes: 0 });
check("browse state: read from the address", stateOf("chapter=Grub&q=pea+nut&time=30"), { query: "pea nut", chapter: "Grub", maxMinutes: 30 });
check("browse state: an unknown chapter or time is off", stateOf("chapter=Nope&time=31"), { query: "", chapter: "", maxMinutes: 0 });
check("browse address: nothing picked is the plain address", browseHash({ query: "  ", chapter: "", maxMinutes: 0 }), "#/browse");
check("browse address: what is picked", browseHash({ query: "pea nut", chapter: "Grub", maxMinutes: 60 }), "#/browse?chapter=Grub&q=pea+nut&time=60");
check("browse address and back, with awkward letters", (() => {
  const picked = { query: "jalapeño & lime?", chapter: "Drank", maxMinutes: 30 };
  return browseState(parseRoute(browseHash(picked)).query, chaptersNow);
})(), { query: "jalapeño & lime?", chapter: "Drank", maxMinutes: 30 });

// which device this is, for the two things only an iPhone does
const iphone = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", platform: "iPhone", maxTouchPoints: 5 };
const ipad = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 5 };
const macSafari = { ...ipad, maxTouchPoints: 0 };
const macChrome = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", platform: "MacIntel", maxTouchPoints: 0 };
check("Open in Calendar is for an iPhone or iPad only", [iphone, ipad, macSafari, macChrome, {}].map(isIosDevice), [true, true, false, false, false]);
check("the week-away warning is for Safari and iPhones", [iphone, ipad, macSafari, macChrome, {}].map(storageCanLapse), [true, true, true, false, false]);

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

lines.push("RESULT " + lines.filter((x) => x.startsWith("ok")).length + " passed, " + failed + " failed");
document.getElementById("out").textContent = lines.join("\n");
document.title = failed ? "FAILED" : "PASSED";
