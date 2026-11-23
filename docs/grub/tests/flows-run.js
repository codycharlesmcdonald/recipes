// Drives the real pages: loads ../index.html in a frame on the same origin, goes to an address, clicks, types
// and reads what the page shows. Loaded only by flows.js, and only on this computer (see local-only.js),
// because it empties and fills the site's own storage. Run with tools/run_tests.py <site> tests/flows.html
import { haystack, narrow, chapterList, chapterOf, mergedLines, shortcutUrl } from "../js/lib.js";
import { realIngredients } from "../js/shopping-list.js";
import { dateValue, defaultDay } from "../js/plan.js";
import { NOT_KEPT } from "../js/state.js";

const frame = document.getElementById("site");
const lines = [];
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed += 1;
  lines.push((ok ? "ok   " : "FAIL ") + name + (ok ? "" : "\n     got  " + JSON.stringify(got) + "\n     want " + JSON.stringify(want)));
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
async function until(what, fn, tries = 200) {
  for (let n = 0; n < tries; n += 1) {
    let v = null;
    try { v = fn(); } catch { v = null; }
    if (v) return v;
    await sleep(10);
  }
  throw new Error("waited for " + what);
}

const win = () => frame.contentWindow;
const doc = () => frame.contentDocument;
const app = () => doc().getElementById("app");
const $ = (sel) => doc().querySelector(sel);
const $$ = (sel) => [...doc().querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null);
const button = (label) => $$("button, a.btn").find((b) => text(b) === label) || null;
const fire = (el, kind) => el.dispatchEvent(new (win().Event)(kind, { bubbles: true }));
function type(el, value) { el.focus(); el.value = value; fire(el, "input"); }
function pick(el, value) { el.value = value; fire(el, "input"); fire(el, "change"); }
const focused = () => doc().activeElement;
const noInnerScroll = (el) => [win().getComputedStyle(el).overflowY, el.scrollHeight <= el.clientHeight + 1, el.classList.contains("fits") || el.classList.contains("tall")];
const sideways = () => Math.max(0, doc().documentElement.scrollWidth - win().innerWidth);

let loads = 0;
async function open(hash) {
  // a fresh load of the site at an address
  loads += 1;
  await new Promise((res) => { frame.addEventListener("load", res, { once: true }); frame.src = "../index.html?load=" + loads + hash; });
  await until("the site at " + hash, () => app() && app().dataset.page);
}
async function reload() {
  await new Promise((res) => { frame.addEventListener("load", res, { once: true }); win().location.reload(); });
  await until("the site after a reload", () => app() && app().dataset.page);
}
async function go(hash, page) {
  if (win().location.hash !== hash) win().location.hash = hash;
  await until("the page " + hash, () => app().dataset.hash === hash && app().dataset.page === page);
}

function audit(where) {
  // every field has a label, every control has a name, and nothing was put on the page as markup
  const bad = [];
  for (const el of $$("input, select, textarea")) {
    if (!(el.labels && el.labels.length) && !el.getAttribute("aria-label")) bad.push("no label: " + (el.id || el.type));
  }
  for (const el of $$("button, a, summary")) if (!text(el) && !el.getAttribute("aria-label")) bad.push("no name: " + el.outerHTML.slice(0, 60));
  check(where + ": every field has a label and every control a name", bad, []);
}

async function flow(name, fn) {
  try { await fn(); } catch (e) {
    failed += 1;
    lines.push("FAIL " + name + " stopped: " + (e && e.message ? e.message : e));
  }
}

// What this browser had kept for the site is put aside first and put back at the end, whatever happens between.
const ours = () => Object.keys(localStorage).filter((k) => k.startsWith("grub."));
const aside = ours().map((k) => [k, localStorage.getItem(k)]);
const wipe = () => { for (const k of ours()) localStorage.removeItem(k); };
const store = (key, data) => localStorage.setItem("grub." + key, JSON.stringify({ v: 1, data }));
wipe();

const data = await fetch("../data/recipes.json").then((x) => x.json());
for (const r of data.recipes) r._words = haystack(r);
const clean = (x) => { const c = JSON.parse(JSON.stringify(x)); delete c.pdf; delete c._words; return c; };
const padThai = data.recipes.find((x) => x.id === "pad-thai-baby");
const burgers = data.recipes.find((x) => x.id === "simple-bangin-burgers");
const larp = data.recipes.find((x) => x.id === "larp-chicken-and-sticky-rice");
const allChapters = chapterList(data.sections, data.recipes);
const rowTitles = () => $$("ul.rows .row-link .t").map(text);
const doorCounts = () => Object.fromEntries($$("ol.doors a").map((a) => [text(a.querySelector(".door-name")), text(a.querySelector(".door-count"))]));

try {
  await flow("home", async () => {
    await open("#/");
    check("home: five doors, in order", $$("ol.doors a .door-name").map(text), ["Draft", "Shopping", "Prep", "Saved", "Browse"]);
    check("home: where the doors lead", $$("ol.doors a").map((a) => a.getAttribute("href")), ["#/draft", "#/shopping", "#/prep", "#/saved", "#/browse"]);
    check("home: the counts with nothing kept yet", $$("ol.doors a .door-count").map(text),
      ["No drafts", "Nothing to get", "Nothing planned", "None saved", data.recipes.length + " recipes"]);
    check("home: each door says what it is for", $$("ol.doors a .door-what").map((x) => text(x).length > 15), [true, true, true, true, true]);
    check("home: the five areas are reachable from every page", $$("#nav a").map((a) => [text(a), a.getAttribute("href")]),
      [["Draft", "#/draft"], ["Shopping", "#/shopping"], ["Prep", "#/prep"], ["Saved", "#/saved"], ["Browse", "#/browse"]]);
    check("home: the site title links home", $(".brand").getAttribute("href"), "#/");
    check("home: the chapters", $$("ul.chapters .chapter-name").map(text), allChapters);
    check("home: a chapter leads to Browse, narrowed to it", $$("ul.chapters a")[0].getAttribute("href"), "#/browse?chapter=" + encodeURIComponent(data.sections[0]));
    check("home: the contents name every recipe under its chapter, each a link to its page", $$("ul.titles a").map((a) => [text(a), a.getAttribute("href")]),
      allChapters.flatMap((c) => data.recipes.filter((r) => chapterOf(r) === c)).map((r) => [r.title, "#/r/" + r.id]));
    check("home: in a computer window the doors are the way in, so the top row does not repeat them", win().getComputedStyle($(".top")).display, "none");
    audit("home");
  });

  await flow("browse", async () => {
    await go("#/browse", "browse");
    const chapters = allChapters.filter((c) => data.recipes.some((r) => chapterOf(r) === c));
    check("browse: every recipe", rowTitles(), data.recipes.map((r) => r.title));
    check("browse: by his chapters", $$(".results h2").map(text), chapters);
    check("browse: marked in the navigation", $$("#nav a[aria-current]").map(text), ["Browse"]);
    check("browse: the top row is back on every page but home", win().getComputedStyle($(".top")).display === "none", false);
    type($("#search"), "peanut");
    const peanut = narrow(data.recipes, { query: "peanut" }).map((r) => r.title);
    check("browse: search narrows the list", [rowTitles(), peanut.length > 0 && peanut.length < data.recipes.length], [peanut, true]);
    check("browse: the count says so", text($(".count")), peanut.length + (peanut.length === 1 ? " recipe" : " recipes") + " of " + data.recipes.length);
    check("browse: the address follows the search", [win().location.hash, app().dataset.hash], ["#/browse?q=peanut", "#/browse?q=peanut"]);
    type($("#search"), "zzzz");
    check("browse: nothing found is said plainly", [rowTitles(), text($(".results .empty"))], [[], "Nothing matches that. Try one word, like an ingredient, or take a filter off."]);
    type($("#search"), "");
    button("Drank").click();
    check("browse: narrow by chapter", [rowTitles(), button("Drank").getAttribute("aria-pressed"), button("All").getAttribute("aria-pressed")],
      [narrow(data.recipes, { chapter: "Drank" }).map((r) => r.title), "true", "false"]);
    button("30 minutes or less").click();
    check("browse: narrow by chapter and time", rowTitles(), narrow(data.recipes, { chapter: "Drank", maxMinutes: 30 }).map((r) => r.title));
    check("browse: the address follows the filters", win().location.hash, "#/browse?chapter=Drank&time=30");
    await reload();
    check("browse: a reload comes back to the same list", [rowTitles(), button("Drank").getAttribute("aria-pressed"), button("30 minutes or less").getAttribute("aria-pressed")],
      [narrow(data.recipes, { chapter: "Drank", maxMinutes: 30 }).map((r) => r.title), "true", "true"]);
    button("All").click();
    check("browse: narrow by time", rowTitles(), narrow(data.recipes, { maxMinutes: 30 }).map((r) => r.title));
    button("An hour or less").click();
    check("browse: an hour or less", rowTitles(), narrow(data.recipes, { maxMinutes: 60 }).map((r) => r.title));
    button("Any").click();
    check("browse: filters off again, and the address is plain again", [rowTitles().length, win().location.hash], [data.recipes.length, "#/browse"]);
    audit("browse");

    // the address is the only memory: in by a chapter link, narrow further, open a recipe, come Back
    await go("#/", "home");
    $$("ul.chapters a.chapter").find((a) => text(a.querySelector(".chapter-name")) === "Grub").click();
    await until("Browse narrowed to Grub", () => app().dataset.page === "browse" && app().dataset.hash === "#/browse?chapter=Grub");
    check("browse: in by a chapter link", [rowTitles(), button("Grub").getAttribute("aria-pressed")], [narrow(data.recipes, { chapter: "Grub" }).map((r) => r.title), "true"]);
    type($("#search"), "peanut");
    const both = narrow(data.recipes, { chapter: "Grub", query: "peanut" }).map((r) => r.title);
    check("browse: chapter and search together", [rowTitles(), win().location.hash], [both, "#/browse?chapter=Grub&q=peanut"]);
    $("ul.rows a.row-link").click();
    await until("the recipe", () => app().dataset.page === "recipe");
    win().history.back();
    await until("Browse again", () => app().dataset.page === "browse");
    check("browse: Back from a recipe returns to the same narrowed list", [rowTitles(), $("#search").value, button("Grub").getAttribute("aria-pressed")], [both, "peanut", "true"]);
    button("All").click();
    type($("#search"), "");
    $("ul.rows a.row-link").click();
    await until("the recipe", () => app().dataset.page === "recipe");
    win().history.back();
    await until("Browse again", () => app().dataset.page === "browse");
    check("browse: a chapter taken off stays off after Back", [rowTitles().length, button("All").getAttribute("aria-pressed"), win().location.hash], [data.recipes.length, "true", "#/browse"]);
    button("Drank").click();
    type($("#search"), "rum");
    await go("#/", "home");
    $("ol.doors a[href='#/browse']").click();
    await until("Browse by its door", () => app().dataset.page === "browse");
    check("browse: the Browse door shows every recipe, whatever was picked last time", [rowTitles().length, $("#search").value, text($(".count"))], [data.recipes.length, "", data.recipes.length + " recipes"]);

    await go("#/r/pad-thai-baby", "recipe");
    check("recipe: the address #/r/<id> still works", [text($("h1")), doc().title], ["Pad Thai, Baby", "Pad Thai, Baby | Hi, My Name is Food"]);
    check("recipe: ticking ingredients and numbered steps", [$$(".ingredients ul.ing input[type=checkbox]").length, $$(".ingredients li.aside").length, $$(".method ol.steps li").length],
      [realIngredients(padThai).length, 3, padThai.steps.reduce((n, g) => n + g.items.length, 0)]);
    check("recipe: the things to do with it", ["Add to shopping list", "Plan a meal", "Print", "Edit a copy as a draft"].map((x) => Boolean(button(x))), [true, true, true, true]);
    check("recipe: the tablet PDF link", $$(".actions a").filter((a) => text(a) === "Tablet PDF").map((a) => a.getAttribute("href")), [padThai.pdf]);
    check("recipe: his time is not called a guess", $(".guess"), null);
    check("recipe: in a computer window the ingredients start in the top third", $(".ingredients h2").getBoundingClientRect().top < 330, true);
    check("recipe: the ingredients column never scrolls inside itself", noInnerScroll($(".recipe .cols .left")), ["visible", true, true]);
    if ("wakeLock" in win().navigator) check("recipe: Keep screen on sits with the steps", Boolean($(".method .steps-head #keep-on")), true);
    check("recipe: a line for the paper names the cookbook and the chapter, and is not on the screen", [text($(".print-only")), win().getComputedStyle($(".print-only")).display], ["Hi, My Name is Food, Grub", "none"]);
    audit("recipe");
    // a window shorter than the ingredient list
    frame.setAttribute("height", "500");
    await open("#/r/pad-thai-baby");
    await until("the ingredients marked taller than the window", () => $(".recipe .cols .left").classList.contains("tall"));
    win().scrollTo(0, 800);
    await sleep(30);
    const col = $(".recipe .cols .left").getBoundingClientRect();
    check("recipe: in a short window the ingredients ride up until their last line shows, then stay there beside the steps",
      [Math.round(col.bottom), col.top < 0, noInnerScroll($(".recipe .cols .left"))[0]], [500 - 16, true, "visible"]);
    frame.setAttribute("height", "900");
    await open("#/r/larp-chicken-and-sticky-rice");
    await go("#/r/larp-chicken-and-sticky-rice", "recipe");
    check("recipe: a guessed total time is said to be a guess", text($(".guess")), "The total time is a guess. Plans count it as 1 day, and you can change that in Prep.");
    await go("#/r/no-such-recipe", "recipe");
    check("recipe: an unknown id is said plainly", text($("#app p")), "That recipe is not here.");
    await go("#/nowhere", "missing");
    check("an unknown address is said plainly", text($("#app p")), "There is no page at this address.");
  });

  await flow("saved", async () => {
    await go("#/saved", "saved");
    check("saved: a plain line when there are none", text($(".empty")), "Nothing saved yet. Press the star on a recipe and it shows up here.");
    await go("#/r/pad-thai-baby", "recipe");
    const star = $(".actions button.star");
    check("saved: the star on the recipe page starts off", [star.getAttribute("aria-pressed"), text(star)], ["false", "Save"]);
    star.click();
    check("saved: starred", [star.getAttribute("aria-pressed"), text(star)], ["true", "Saved"]);
    await go("#/saved", "saved");
    check("saved: the starred recipe is listed", rowTitles(), ["Pad Thai, Baby"]);
    await go("#/browse", "browse");
    const starOf = (title) => $$("ul.rows li").find((li) => text(li.querySelector(".t")) === title).querySelector("button.star");
    check("saved: the star shows in lists", [starOf("Pad Thai, Baby").getAttribute("aria-pressed"), starOf("Buttermilk").getAttribute("aria-pressed")], ["true", "false"]);
    starOf("Buttermilk").click();
    await go("#/saved", "saved");
    check("saved: starred from a list, newest first", [rowTitles(), text($(".count"))], [["Buttermilk", "Pad Thai, Baby"], "2 recipes. Kept on this device."]);
    const first = $$("ul.rows button.star")[0];
    first.focus();
    first.click();
    check("saved: a star pressed off leaves the recipe in sight, hollow, and the page says so",
      [rowTitles(), first.getAttribute("aria-pressed"), text($("#app .status")), text($(".count")), focused() === first],
      [["Buttermilk", "Pad Thai, Baby"], "false", "Took Buttermilk off Saved. Press its star again to put it back.", "1 recipe. Kept on this device.", true]);
    first.click();
    check("saved: a second press puts it back", [first.getAttribute("aria-pressed"), text($("#app .status")), text($(".count"))], ["true", "Put Buttermilk back on Saved.", "2 recipes. Kept on this device."]);
    first.click();
    await go("#/", "home");
    await go("#/saved", "saved");
    check("saved: it is gone once the page has been left", rowTitles(), ["Pad Thai, Baby"]);
    await reload();
    check("saved: kept on the device across a reload", rowTitles(), ["Pad Thai, Baby"]);
    audit("saved");
    await go("#/", "home");
    check("home: the saved count", doorCounts().Saved, "1 saved");
  });

  await flow("shopping", async () => {
    await go("#/shopping", "shopping");
    check("shopping: a plain line when the list is empty", text($(".empty")).startsWith("Nothing on the list."), true);
    await go("#/r/pad-thai-baby", "recipe");
    button("Add to shopping list").click();
    const real = realIngredients(padThai);
    const boxes = $$(".panel ul.ing input");
    check("shopping: the picker offers every real ingredient, ticked", [boxes.length, boxes.every((b) => b.checked)], [real.length, true]);
    check("shopping: joke lines are never offered", text($(".panel")).includes("drummers"), false);
    check("shopping: a tick in the picker does not cross the line out", win().getComputedStyle($(".panel ul.ing input:checked + span")).textDecorationLine, "none");
    check("shopping: the picker takes the place of the ingredient list, so there is one list on the page, not two",
      [$(".panel").parentElement === $(".recipe .cols .left"), $(".ingredients").hidden, $$("ul.ing").filter((u) => u.getClientRects().length).length], [true, true, 1]);
    boxes[0].click();
    check("shopping: unticking counts down", text($(".panel button.primary")), "Add " + (real.length - 1) + " to the shopping list");
    $(".panel button.primary").click();
    check("shopping: added, with a way to the list", [text($(".panel .status")), $(".panel .status a").getAttribute("href")],
      ["Added " + (real.length - 1) + ". See the shopping list", "#/shopping"]);
    $(".panel button.primary").click();
    check("shopping: adding the same again does not double it", text($(".panel .status")), (real.length - 1) + " were already on the list. See the shopping list");
    button("Close").click();
    check("shopping: closing the picker brings the ingredient list back", [$(".panel"), $(".ingredients").hidden, button("Add to shopping list").getAttribute("aria-expanded")], [null, false, "false"]);
    await go("#/r/simple-bangin-burgers", "recipe");
    button("Add to shopping list").click();
    $(".panel button.primary").click();
    await go("#/shopping", "shopping");
    const wanted = real.slice(1).concat(realIngredients(burgers));
    const items = () => $$("ul.shop li");
    const said = () => text($("#app .right > .status"));
    check("shopping: grouped by recipe, each heading a link back", $$(".shop-group h2 a").map((a) => [text(a), a.getAttribute("href")]),
      [["Pad Thai, Baby", "#/r/pad-thai-baby"], ["Simple Bangin Burgers", "#/r/simple-bangin-burgers"]]);
    check("shopping: the things added are on the list", [items().length, text(items()[0].querySelector(".nm")), text(items()[0].querySelector(".amt"))], [wanted.length, "Garlic", "2 cloves"]);
    check("shopping: Send to Reminders carries the list, the same thing from two recipes once",
      [$("a.btn.primary").getAttribute("href"), mergedLines(wanted).includes("Garlic (2 cloves + 2 cloves)")], [shortcutUrl(mergedLines(wanted)), true]);
    check("shopping: Send to Reminders comes before the list in the page, and sits to its right in a computer window",
      [Boolean($(".stack").compareDocumentPosition($("ul.shop")) & 4), $(".cols.side .left").getBoundingClientRect().left < $(".stack").getBoundingClientRect().left,
        Math.abs($(".stack").getBoundingClientRect().top - $(".cols.side .left").getBoundingClientRect().top) < 4], [true, true, true]);
    items()[1].querySelector("input").click();
    check("shopping: tick one as got", [items()[1].className, text($(".count"))], ["got", (wanted.length - 1) + " to get, 1 got. Kept on this device."]);
    check("shopping: a ticked thing is not sent", $("a.btn.primary").getAttribute("href"), shortcutUrl(mergedLines(wanted.filter((_, n) => n !== 1))));
    button("Clear ticked").click();
    check("shopping: clear ticked", [items().length, said()], [wanted.length - 1, "Took 1 off the list."]);
    type($("#own-item"), "Paper towels");
    $("form.add-own").requestSubmit();
    check("shopping: something of his own, in its own group at the end", [items().length, text($$(".shop-group h2").pop()), text(items().pop().querySelector(".nm")), $("#own-item").value],
      [wanted.length, "Your own", "Paper towels", ""]);
    type($("#own-item"), "🧄");
    $("form.add-own").requestSubmit();
    type($("#own-item"), "🍋");
    $("form.add-own").requestSubmit();
    check("shopping: two things with no letters in their names are two things", [items().slice(-2).map((li) => text(li.querySelector(".nm"))), said()], [["🧄", "🍋"], "Added 🍋."]);
    items().pop().querySelector("button.remove").click();
    check("shopping: after the last thing is removed the keyboard is on the one before it", [text(items().pop().querySelector(".nm")), focused() === items().pop().querySelector("button.remove")], ["🧄", true]);
    items().pop().querySelector("button.remove").click();
    items()[0].querySelector("button.remove").click();
    check("shopping: remove one, and the keyboard stays in the list, on the thing that moved up", [items().length, said(), focused() === items()[0].querySelector("button.remove")],
      [wanted.length - 1, "Removed garlic.", true]);
    await reload();
    check("shopping: kept on the device across a reload", items().length, wanted.length - 1);
    audit("shopping");
    await go("#/", "home");
    check("home: the shopping count", doorCounts().Shopping, (wanted.length - 1) + " to get");
    await go("#/shopping", "shopping");
    button("Clear all").click();
    check("shopping: clearing all asks first, inside the page", [text($(".ask-q")), items().length], ["Clear the whole list?", wanted.length - 1]);
    button("Keep it").click();
    check("shopping: kept", [$(".ask"), items().length], [null, wanted.length - 1]);
    button("Clear all").click();
    button("Yes, clear it").click();
    check("shopping: cleared, and the keyboard is on the add box", [items().length, said(), button("Clear all").closest(".stack").hidden, focused() === $("#own-item")], [0, "The list is empty.", true, true]);
    check("shopping: the Shortcut help is there, folded away, with the tap it needs and a try-it step",
      [text($("details.help summary")), $("details.help").open, $$("details.help ol li").length, text($$("details.help ol li")[1]), text($$("details.help ol li").pop())],
      ["Set up Send to Reminders (once, on the iPhone)", false, 6, "Add the action Split Text. Tap the blue word in it and choose Shortcut Input. Leave it on New Lines.",
        "Come back here and press Send to Reminders. The first time, allow it."]);
    type($("#own-item"), "Milk");
    $("form.add-own").requestSubmit();
    items()[0].querySelector("input").click();
    const send = $("a.btn.primary");
    send.click();
    check("shopping: with everything ticked, Send to Reminders says why it does nothing, to the mouse and to the keyboard",
      [send.hasAttribute("href"), send.getAttribute("aria-disabled"), send.tabIndex, said()], [false, "true", 0, "Everything is ticked, so there is nothing to send."]);
    button("Clear ticked").click();
    check("shopping: empty again", [items().length, focused() === $("#own-item")], [0, true]);
  });

  await flow("prep", async () => {
    await go("#/prep", "prep");
    check("prep: a plain line when nothing is picked", text($(".empty")).startsWith("Nothing picked yet."), true);
    await go("#/r/pad-thai-baby", "recipe");
    button("Plan a meal").click();
    await until("the prep page", () => app().dataset.page === "prep");
    const cooking = () => $$("ul.cooking li .t").map(text);
    check("prep: Plan a meal on a recipe adds that recipe", cooking(), ["Pad Thai, Baby"]);
    pick($("#plan-pick"), "larp-chicken-and-sticky-rice");
    button("Add to the plan").click();
    check("prep: a second recipe from the picker", cooking(), ["Pad Thai, Baby", "Larp Chicken & Sticky Rice"]);
    check("prep: a picked recipe leaves the picker", $$("#plan-pick option").some((o) => o.value === "larp-chicken-and-sticky-rice"), false);
    check("prep: a day-long recipe added after Prep was first opened moves the day, so nothing starts in the past",
      [$("#plan-day").value, $(".plan-out .warn")], [defaultDay(Date.now(), "18:30", larp.total_minutes), null]);
    const day = dateValue(Date.now() + 3 * 86400000);
    type($("#plan-day"), day);
    type($("#plan-time"), "18:30");
    const [y, mo, d] = day.split("-").map(Number);
    const meal = new Date(y, mo - 1, d, 18, 30).getTime();
    const dayName = (ms) => new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(ms);
    const fullDay = (ms) => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(ms);
    const clock = (ms) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(ms);
    const start = (title, minutes) => [dayName(meal - minutes * 60000) + " at " + clock(meal - minutes * 60000), "Start " + title];
    const eat = [dayName(meal) + " at " + clock(meal), "Eat"];
    const timeline = () => $$("ol.timeline li").map((li) => [text(li.querySelector(".when")), text(li.querySelector(".what"))]);
    check("prep: the timeline, earliest start first, ending with the meal: when, then what", timeline(),
      [start("Larp Chicken & Sticky Rice", 1440), start("Pad Thai, Baby", 60), eat]);
    if (clock(meal) === "6:30 PM") check("prep: the words of the timeline", [timeline()[1][0].endsWith(" at 5:30 PM"), timeline()[2][0].endsWith(" at 6:30 PM")], [true, true]);
    const hours = () => $("#hours-larp-chicken-and-sticky-rice"), mins = () => $("#mins-larp-chicken-and-sticky-rice");
    const note = () => text($("ul.cooking li[data-id=larp-chicken-and-sticky-rice] .guess-line .warn"));
    check("prep: a guessed time says so and can be changed for this plan, in hours and minutes",
      [text($("ul.cooking li[data-id=larp-chicken-and-sticky-rice] .guess-line p")), hours().value, mins().value, $("#mins-pad-thai-baby")],
      ["The total time for this one is a guess. Change it if you know better. It only changes this plan.", "24", "", null]);
    type(hours(), "10");
    check("prep: his time moves the start", timeline(), [start("Larp Chicken & Sticky Rice", 600), start("Pad Thai, Baby", 60), eat]);
    type(hours(), "");
    check("prep: a time the plan cannot use is said, and the recipe's own is used", [note(), timeline()[0]],
      ["The plan can't use that (plain numbers, two weeks at most). Using the recipe's 1 day.", start("Larp Chicken & Sticky Rice", 1440)]);
    type(mins(), "999999999999");
    check("prep: a huge number does not break the page", [note().startsWith("The plan can't use that"), timeline(), text($("#app h1")), button("Add to Calendar").closest(".row").hidden],
      [true, [start("Larp Chicken & Sticky Rice", 1440), start("Pad Thai, Baby", 60), eat], "Prep", false]);
    await reload();
    check("prep: and nothing of it is left after a reload", [app().dataset.page, timeline().length, hours().value], ["prep", 3, "24"]);
    type(hours(), "336");
    check("prep: a start a week or more ahead names the date, not only the weekday", timeline()[0],
      [fullDay(meal - 20160 * 60000) + " at " + clock(meal - 20160 * 60000), "Start Larp Chicken & Sticky Rice"]);
    type(hours(), "1.5");
    check("prep: an hour and a half", [note(), timeline()[0]], ["", start("Larp Chicken & Sticky Rice", 90)]);
    type(hours(), "");
    type(mins(), "30");
    check("prep: and the order follows the start times", timeline(), [start("Pad Thai, Baby", 60), start("Larp Chicken & Sticky Rice", 30), eat]);
    check("prep: the calendar and copy buttons; the iPhone one is not shown on a computer",
      ["Add to Calendar", "Copy plan", "Clear plan"].map((x) => Boolean(button(x)) && !button(x).closest(".row").hidden).concat(Boolean(button("Open in Calendar (iPhone)"))), [true, true, true, false]);
    pick($("#plan-alert"), "30");
    await reload();
    check("prep: the plan is kept on the device, and so is the day he set", [cooking(), timeline(), $("#plan-day").value, $("#plan-time").value, $("#plan-alert").value],
      [["Pad Thai, Baby", "Larp Chicken & Sticky Rice"], [start("Pad Thai, Baby", 60), start("Larp Chicken & Sticky Rice", 30), eat], day, "18:30", "30"]);
    audit("prep");
    await go("#/", "home");
    check("home: the prep count", doorCounts().Prep, "2 planned");
    await go("#/prep", "prep");
    $("ul.cooking li[data-id=pad-thai-baby] button.remove").click();
    check("prep: take one out", [cooking(), timeline().length], [["Larp Chicken & Sticky Rice"], 2]);
    button("Clear plan").click();
    check("prep: clearing the plan asks first, inside the page", [text($(".ask-q")), cooking()], ["Clear the plan?", ["Larp Chicken & Sticky Rice"]]);
    button("Keep it").click();
    check("prep: kept", [$(".ask"), cooking()], [null, ["Larp Chicken & Sticky Rice"]]);
    button("Clear plan").click();
    button("Yes, clear it").click();
    check("prep: until he clears it", [cooking(), text($(".empty")).startsWith("Nothing picked yet."), text($("#app .status")), $("#plan-day").value],
      [[], true, "The plan is cleared.", defaultDay(Date.now(), "18:30", 0)]);
  });

  let toastHash = "";
  await flow("draft", async () => {
    await go("#/draft", "draft");
    check("draft: no drafts yet, so no list", $(".drafts"), null);
    check("draft: says honestly that saving to the site is not built, and where the file goes",
      [text($(".finish h2")), text($(".finish")).includes("Saving straight to the site isn't built yet."), text($(".finish")).includes("It goes in the recipes folder.")], ["Recipe file", true, true]);
    check("draft: the form says the total time is required", text($("fieldset.time legend")), "Total time, start to finish (every recipe needs one)");
    type($("#f-title"), "x");
    await until("the draft's own address", () => /^#\/draft\/[a-z0-9]+$/.test(win().location.hash));
    type($("#f-title"), "");
    check("draft: a form emptied again is not kept as a draft", [win().location.hash, app().dataset.hash, localStorage.getItem("grub.drafts").includes("\"data\":[]")], ["#/draft", "#/draft", true]);
    await go("#/", "home");
    check("home: so it is not counted", doorCounts().Draft, "No drafts");
    await go("#/draft", "draft");
    type($("#f-title"), "Test Toast");
    await until("the draft's own address", () => /^#\/draft\/[a-z0-9]+$/.test(win().location.hash));
    const hash = win().location.hash;
    toastHash = hash;
    const typedSteps = "Preparation:\n1. Toast the bread.\n2) Butter it.";
    type($("#f-ingredients"), "2 slices bread\nbutter, to taste\nJoke: a toaster the size of a car");
    type($("#f-steps"), typedSteps);
    type($("#f-headnote"), "<img src=x> & toast");
    check("draft: the preview shows the recipe as its page will look, with the page's own step numbers only",
      [text($(".preview .recipe-title")), $$(".preview ul.ing li").map(text), text($(".preview h4")), $$(".preview ol.steps li").map(text), text($(".preview .meta span"))],
      ["Test Toast", ["2 slices bread", "butter, to taste", "a toaster the size of a car"], "Preparation", ["Toast the bread.", "Butter it."], "No total time yet."]);
    check("draft: one top heading on the page; the preview sits a level down", [$$("h1").map(text), $(".preview .recipe-title").tagName, $$(".preview h3").map(text)],
      [["Draft a recipe"], "H2", ["Ingredients", "Steps"]]);
    check("draft: the preview's tick boxes are pictures, not places Tab stops", [$$(".preview input").length, $$(".preview .box").length], [0, 2]);
    check("draft: the preview never scrolls inside itself", noInnerScroll($(".cols.even .right")), ["visible", true, true]);
    check("draft: what he types is only ever put on the page as text", [text($(".preview .headnote")), $(".preview img")], ["<img src=x> & toast", null]);
    check("draft: the time line before a time is given", text($("#takes")), "No total time yet. The start time and the calendar file are worked out from it.");
    button("Copy recipe file").click();
    check("draft: refused without a total time, and it says why", text($(".finish .status")),
      "No recipe file yet. It needs a total time above zero. The start time and the calendar file are worked out from it.");
    check("draft: no recipe file while something is missing", $("#recipe-file").value, "");
    await reload();
    check("draft: still there after a reload, as typed", [win().location.hash, $("#f-title").value, $("#f-ingredients").value, $("#f-steps").value],
      [hash, "Test Toast", "2 slices bread\nbutter, to taste\nJoke: a toaster the size of a car", typedSteps]);
    await go("#/draft", "draft");
    check("draft: listed with when it was last touched", [$$(".drafts .row-link .t").map(text), text($(".drafts .row-link .m")).startsWith("Last touched "), $(".drafts .row-link").getAttribute("href")],
      [["Test Toast"], true, hash]);
    check("draft: the list sits in the form's column, with a heading the size of the form's", [$(".drafts").closest(".left") === $(".form").closest(".left"),
      win().getComputedStyle($(".drafts h2")).fontSize === win().getComputedStyle($(".new-title")).fontSize], [true, true]);
    audit("draft list");
    await go(hash, "draft");
    $$("button.chip").find((b) => b.dataset.minutes === "30").click();
    check("draft: a one-tap time", [text($("#takes")), $("#f-hours").value, $("#f-minutes").value, $$("button.chip[aria-pressed=true]").map(text)],
      ["Takes 30 minutes, start to finish.", "", "30", ["30 minutes"]]);
    $$("button.chip").find((b) => b.dataset.minutes === "90").click();
    check("draft: an hour and a half", [text($("#takes")), $("#f-hours").value, $("#f-minutes").value], ["Takes 1 hour 30 minutes, start to finish.", "1", "30"]);
    type($("#f-hours"), "1.5");
    check("draft: 1.5 typed under hours is an hour and a half, never zero", [text($("#takes")), JSON.parse($("#recipe-file").value).total_minutes], ["Takes 2 hours, start to finish.", 120]);
    type($("#f-hours"), "-2");
    check("draft: a time box that is not a plain number is said, and no file is made from it", [text($("#takes")), text($(".needed")), $("#recipe-file").value],
      ["The time boxes take numbers only, like 1 hour 30 minutes.", "No recipe file yet. The time boxes take numbers only, like 1 hour 30 minutes.", ""]);
    type($("#f-hours"), "50");
    type($("#f-minutes"), "");
    check("draft: a day or more under hours is questioned", text($("#takes")), "Takes 2 days 2 hours, start to finish. That is a day or more. If you meant minutes, move the number to the minutes box.");
    type($("#f-hours"), "");
    type($("#f-minutes"), "50");
    check("draft: the live line", text($("#takes")), "Takes 50 minutes, start to finish.");
    check("draft: nothing missing now", text($(".needed")), "Nothing is missing. The recipe file is ready.");
    pick($("#f-chapter"), "__other");
    check("draft: another chapter can be typed", $("#f-chapter-other").closest("label").hidden, false);
    type($("#f-chapter-other"), "Snacks");
    type($("#f-tags"), "toast, bread");
    const file = JSON.parse($("#recipe-file").value);
    check("draft: the recipe file", [file.schema, file.id, file.version, file.title, file.section, file.total_minutes, file.tags, file.ingredients, file.steps, file.headnote,
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(file.created), file.created === file.updated],
    [1, "test-toast", 1, "Test Toast", "Snacks", 50, ["toast", "bread"],
      [{ section: "", items: [{ qty: "2", unit: "slices", name: "bread", note: "" }, { qty: "", unit: "", name: "butter", note: "to taste" },
        { qty: "", unit: "", name: "a toaster the size of a car", note: "", aside: true }] }],
      [{ section: "Preparation", items: ["Toast the bread.", "Butter it."] }], "<img src=x> & toast", true, true]);
    check("draft: the preview follows", [text($(".preview .kicker")), text($(".preview .meta span"))], ["Snacks", "Ready in 50 minutes."]);
    button("Download recipe file").click();
    check("draft: the file is handed over once nothing is missing", text($(".finish .status")), "Downloaded test-toast.json. Look in Downloads.");
    audit("draft form");
    await go("#/", "home");
    check("home: the draft count", doorCounts().Draft, "1 draft");

    await go("#/r/spring-rolls", "recipe");
    button("Edit a copy as a draft").click();
    await until("the draft made from the recipe", () => app().dataset.page === "draft" && $("#f-title"));
    const rolls = data.recipes.find((x) => x.id === "spring-rolls");
    check("draft: a copy of a recipe fills the form", [$("#f-title").value, $("#f-chapter").value, $("#f-hours").value, $("#f-minutes").value, win().location.hash],
      [rolls.title, rolls.section, "3", "25", "#/draft?copy=spring-rolls"]);
    check("draft: left alone, it is the same recipe file", JSON.stringify(JSON.parse($("#recipe-file").value)) === JSON.stringify(clean(rolls)), true);
    check("draft: a guessed time is said to be a guess", text($("#takes")).includes("This number is a guess that came with the recipe."), true);
    check("draft: the copy note says what happens to the recipe", text($(".note p")), "This is a copy of " + rolls.title + ". Added to the site, it replaces " + rolls.title + ". Tick the box to keep both.");
    await go("#/", "home");
    check("home: a copy with nothing changed is not a draft yet", doorCounts().Draft, "1 draft");
    await go("#/draft?copy=spring-rolls", "draft");
    type($("#f-title"), rolls.title + " II");
    await until("the copy's own address", () => /^#\/draft\/[a-z0-9]+$/.test(win().location.hash));
    const next = JSON.parse($("#recipe-file").value);
    check("draft: a changed copy keeps the address and is the next version", [next.id, next.version, next.created, next.title], [rolls.id, rolls.version + 1, rolls.created, rolls.title + " II"]);
    const copyHash = win().location.hash;
    await go("#/r/spring-rolls", "recipe");
    check("draft: the recipe itself is untouched", text($("h1")), rolls.title);
    button("Edit a copy as a draft").click();
    await until("the same copy again", () => app().dataset.page === "draft" && $("#f-title"));
    check("draft: Edit a copy carries on with the copy he already changed", [win().location.hash, $("#f-title").value], [copyHash, rolls.title + " II"]);
    $("#f-separate").click();
    const other = JSON.parse($("#recipe-file").value);
    check("draft: or a separate recipe with its own address", [other.id, other.version], ["fuckin-spring-rolls-ii", 1]);
    await go("#/draft", "draft");
    check("draft: both drafts are listed, last touched first", $$(".drafts .row-link").map((a) => [text(a.querySelector(".t")), a.getAttribute("href")]),
      [[rolls.title + " II", copyHash], ["Test Toast", hash]]);
    $$(".drafts button.remove")[0].click();
    check("draft: deleting asks first, inside the page", [text($(".drafts .ask-q")), $$(".drafts .row-link").length], ["Delete the draft " + rolls.title + " II?", 2]);
    button("Keep it").click();
    check("draft: kept", [$(".drafts .ask"), $$(".drafts .row-link").length], [null, 2]);
    $$(".drafts button.remove")[0].click();
    button("Yes, delete it").click();
    check("draft: deleted, said right under the list, with the keyboard on the draft that moved up",
      [$$(".drafts .row-link .t").map(text), text($(".drafts .status")), focused() === $$(".drafts button.remove")[0]], [["Test Toast"], "Deleted the draft " + rolls.title + " II.", true]);
    await go(copyHash, "draft");
    check("draft: a deleted draft's address says so", text($("#app p")), "That draft isn't on this device.");
    await go("#/draft?copy=no-such-recipe", "draft");
    check("draft: a copy of a recipe that is not here says so", text($("#app p")), "That recipe is not here.");
  });

  await flow("long words", async () => {
    // one long unbroken word (a pasted link) must wrap, in a computer window too
    const link = "https://example.com/" + "x".repeat(84);
    await go("#/draft", "draft");
    type($("#f-title"), "W".repeat(300));
    await until("the draft's own address", () => /^#\/draft\/[a-z0-9]+$/.test(win().location.hash));
    type($("#f-ingredients"), "2 cups " + link);
    type($("#f-steps"), "Open " + link);
    const wide = [];
    if (sideways()) wide.push("the draft form is " + sideways() + " too wide");
    await go("#/draft", "draft");
    if (sideways()) wide.push("the drafts list is " + sideways() + " too wide");
    await go("#/shopping", "shopping");
    type($("#own-item"), link);
    $("form.add-own").requestSubmit();
    if (sideways()) wide.push("shopping is " + sideways() + " too wide");
    check("a long unbroken word wraps in a computer window", wide, []);
  });

  await flow("a narrow window", async () => {
    // between a phone and a full window (a half-screen window on a Mac): one column, with air between the parts
    frame.setAttribute("width", "720");
    await open("#/r/pad-thai-baby");
    button("Add to shopping list").click();
    $(".panel button.primary").click();
    const gap = (above, below) => Math.round(below.getBoundingClientRect().top - above.getBoundingClientRect().bottom);
    check("narrow: the site title stays on one line and the top row keeps its height", [$(".brand").getBoundingClientRect().height < 34, $(".top").getBoundingClientRect().height < 80], [true, true]);
    await go("#/shopping", "shopping");
    check("narrow: what to do with the list is above it, with air between", [gap($(".stack"), $(".cols.side .left")) >= 20, sideways()], [true, 0]);
    await go("#/browse", "browse");
    check("narrow: the count does not sit on the first chapter", [gap($(".count"), $(".results h2")) >= 20, sideways()], [true, 0]);
    await go("#/prep", "prep");
    check("narrow: The plan has air above it", [gap($(".when-boxes"), $(".cols.even .right h2")) >= 28, sideways()], [true, 0]);
    await go("#/", "home");
    check("narrow: the title has air under it", [gap($(".home-title .lede"), $("ol.doors")) >= 20, sideways()], [true, 0]);
    frame.setAttribute("width", "1280");
  });

  await flow("damaged storage", async () => {
    // right format number, wrong things inside: every page still draws, with what can be read
    wipe();
    store("drafts", [{ id: "dbad1", touched: "soon", fields: { title: 5, steps: ["x"] }, origin: "str" },
      { id: "dbad2", touched: 1e20, separate: 1, fields: { title: "Kept" }, origin: {} }, { id: "dbad2", fields: { title: "Twice" } }, "junk", null]);
    store("plan", { items: [{ id: "larp-chicken-and-sticky-rice", minutes: 1e13 }, { id: "larp-chicken-and-sticky-rice", minutes: -30 }, { id: "pad-thai-baby", minutes: "abc" }, 7],
      date: "2026-13-45", time: "99:99", alarm: 7, dayChosen: true });
    store("shopping", [{ key: "k1", name: "milk", qty: 5, got: "yes" }, { key: 2, name: "x" }, { key: "k1", name: "milk again" }, null]);
    store("stars", ["pad-thai-baby", 5, "pad-thai-baby", ""]);
    store("eatAt", "25:00");
    await open("#/draft");
    check("damaged: the drafts list draws", $$(".drafts .row-link").map((a) => [text(a.querySelector(".t")), a.getAttribute("href")]), [["Untitled draft", "#/draft/dbad1"], ["Kept", "#/draft/dbad2"]]);
    await go("#/draft/dbad1", "draft");
    check("damaged: a draft with wrong fields opens as an empty form", [$("#f-title").value, $("#f-steps").value, $(".note")], ["", "", null]);
    await go("#/prep", "prep");
    check("damaged: Prep draws, each recipe once, with the recipe's own time and a real day and time",
      [$$("ul.cooking li .t").map(text), $$("ol.timeline li").length, $("#hours-larp-chicken-and-sticky-rice").value, $("#plan-time").value, $("#plan-day").value],
      [["Larp Chicken & Sticky Rice", "Pad Thai, Baby"], 3, "24", "18:30", defaultDay(Date.now(), "18:30", 1440)]);
    await go("#/shopping", "shopping");
    check("damaged: Shopping draws what is a real item", $$("ul.shop li").map((li) => [text(li.querySelector(".nm")), li.className]), [["Milk", ""]]);
    await go("#/saved", "saved");
    check("damaged: Saved draws", rowTitles(), ["Pad Thai, Baby"]);
    await go("#/", "home");
    check("damaged: Home counts what is real", doorCounts(), { Draft: "2 drafts", Shopping: "1 to get", Prep: "2 planned", Saved: "1 saved", Browse: data.recipes.length + " recipes" });

    // and if a page does fail for a reason nobody thought of, it says so and the site carries on
    const real = win().Intl.DateTimeFormat;
    win().Intl.DateTimeFormat = function () { throw new Error("made to fail by the test"); };
    await go("#/prep", "prep");
    check("a page that fails says so plainly, marks where it is, and offers the way out",
      [text($("#app h1")), text($("#app p")), $("#app a").getAttribute("href"), $$("#nav a[aria-current]").map(text)], ["That didn't work", "This page hit a problem and could not be shown.", "#/", ["Prep"]]);
    win().Intl.DateTimeFormat = real;
    await go("#/saved", "saved");
    check("and the next page works", rowTitles(), ["Pad Thai, Baby"]);
  });

  await flow("storage switched off", async () => {
    // a browser that will not save: the pages work for the visit and do not claim anything is kept
    const proto = win().Storage.prototype, realSet = proto.setItem;
    proto.setItem = function () { throw new Error("blocked by the test"); };
    try {
      await go("#/shopping", "shopping");
      check("not kept: Shopping says so", [text($(".count")), text($(".count")).includes("Kept on this device")], ["1 to get. " + NOT_KEPT, false]);
      await go("#/saved", "saved");
      check("not kept: Saved says so", text($(".count")), "1 recipe. " + NOT_KEPT);
      await go("#/draft", "draft");
      check("not kept: Draft says so", [text($(".lede")).endsWith(NOT_KEPT), text($(".lede")).includes("saves itself")], [true, false]);
      await go("#/prep", "prep");
      check("not kept: Prep says so", [text($(".plan-note")).startsWith(NOT_KEPT), text($(".plan-note")).includes("kept on this device")], [true, false]);
    } finally { proto.setItem = realSet; }
    await go("#/shopping", "shopping");
    await go("#/prep", "prep");
    check("kept again once the browser saves again", text($(".plan-note")).startsWith("The plan is kept on this device until you clear it."), true);
  });

  await flow("phone width", async () => {
    // the same pages in a frame 390 px wide: nothing scrolls sideways and the things to tap are at least 44 px tall
    wipe();
    frame.setAttribute("width", "390");
    frame.setAttribute("height", "844");
    const link = "https://example.com/" + "x".repeat(84);
    store("drafts", [{ id: "dlong", touched: 5, fields: { title: "W".repeat(300), ingredients: "2 cups " + link, steps: "Open " + link, tips: link, headnote: link } }]);
    await open("#/r/pad-thai-baby");
    $(".actions button.star").click();
    button("Add to shopping list").click();
    $(".panel button.primary").click();
    button("Close").click();
    check("phone: a recipe's three buttons sit in one row", new Set($$(".actions .row.main button").map((b) => Math.round(b.getBoundingClientRect().top))).size, 1);
    button("Plan a meal").click();
    await until("the prep page", () => app().dataset.page === "prep");
    await go("#/shopping", "shopping");
    type($("#own-item"), link);
    $("form.add-own").requestSubmit();
    check("phone: Send to Reminders is above the list", $("a.btn.primary").getBoundingClientRect().bottom <= $("ul.shop").getBoundingClientRect().top, true);
    const hashes = [["#/", "home"], ["#/browse", "browse"], ["#/saved", "saved"], ["#/shopping", "shopping"], ["#/prep", "prep"], ["#/draft", "draft"], ["#/draft/dlong", "draft"],
      ["#/r/pad-thai-baby", "recipe"], ["#/r/grilled-cheese", "recipe"]];
    const wide = [], small = [];
    for (const [hash, page] of hashes) {
      await go(hash, page);
      if (doc().documentElement.scrollWidth > 390) wide.push(hash + " is " + doc().documentElement.scrollWidth + " wide");
      for (const el of $$("button, a.btn, #nav a, ol.doors a, ul.chapters a, a.row-link, select, textarea, input:not([type=checkbox]), summary, ul.ing label, ul.shop label, label.check, label.switch, .row.minor a")) {
        const box = el.getBoundingClientRect();
        if (box.width && box.height < 43.5) small.push(hash + " " + (text(el) || el.id || el.type).slice(0, 30) + " is " + Math.round(box.height));
      }
    }
    check("phone: no page scrolls sideways, even with a pasted link in a list and a draft", wide, []);
    check("phone: the things to tap are at least 44 px tall", small, []);
    const bar = $("#nav").getBoundingClientRect();
    check("phone: the five names are a bar at the bottom", [win().getComputedStyle($("#nav")).position, Math.round(bar.bottom), Math.round(bar.width), $$("#nav a").map(text)],
      ["fixed", 844, 390, ["Draft", "Shopping", "Prep", "Saved", "Browse"]]);
  });
} finally {
  wipe();
  for (const [k, v] of aside) localStorage.setItem(k, v);
}

lines.push("RESULT " + lines.filter((x) => x.startsWith("ok")).length + " passed, " + failed + " failed");
document.getElementById("out").textContent = lines.join("\n");
document.title = failed ? "FAILED" : "PASSED";
