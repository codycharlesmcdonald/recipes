import { fold, haystack, matches, minutesText, ingredientText, shoppingLine, shortcutUrl, buildIcs, icsFileName } from "../js/lib.js";

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

lines.push("RESULT " + (lines.length - failed) + " passed, " + failed + " failed");
document.getElementById("out").textContent = lines.join("\n");
document.title = failed ? "FAILED" : "PASSED";
