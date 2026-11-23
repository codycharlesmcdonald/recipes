// Drives the real pages: loads ../index.html in a frame on the same origin, goes to an address, clicks, types
// and reads what the page shows. Loaded only by flows.js, and only on this computer (see local-only.js),
// because it empties and fills the site's own storage. Run with tools/run_tests.py <site> tests/flows.html
import { haystack, narrow, chapterList, chapterOf, mergedLines, daysLabel, shortTime, totalText, timeFacts } from "../js/lib.js";
import { realIngredients } from "../js/shopping-list.js";
import { draftFromRecipe } from "../js/recipe-format.js";
import { dateValue, defaultDay } from "../js/plan.js";
import { NOT_KEPT } from "../js/state.js";

const frame = document.getElementById("site");
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

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
// A wait ends the moment what it waits for is there. The time allowed is only ever used up when something is
// wrong, so it is generous: a slow or busy computer must not turn into a failed check.
const WAIT_MS = 20000;
async function until(what, fn, ms = WAIT_MS) {
  const end = performance.now() + ms;
  for (;;) {
    let v = null;
    try { v = fn(); } catch { v = null; }
    if (v) return v;
    if (performance.now() > end) throw new Error("waited for " + what);
    await sleep(10);
  }
}
// for a check that reads the page right after something that settles a moment later: waits for it, and if it
// never comes lets the check itself say what was wrong
const settled = (fn) => until("", fn, 3000).catch(() => null);

const win = () => frame.contentWindow;
const doc = () => frame.contentDocument;
const app = () => doc().getElementById("app");
const $ = (sel) => doc().querySelector(sel);
const $$ = (sel) => [...doc().querySelectorAll(sel)];
const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null);
const button = (label) => $$("button").find((b) => text(b) === label) || null;
const fire = (el, kind) => el.dispatchEvent(new (win().Event)(kind, { bubbles: true }));
function type(el, value) { el.focus(); el.value = value; fire(el, "input"); }
function pick(el, value) { el.value = value; fire(el, "input"); fire(el, "change"); }
function typeKeys(el, keys) {
  // typed the way a person types, in place of what the box held. A number box can then end up holding text
  // the browser will not hand over ("1e", "--"): its value reads as empty and validity.badInput is true.
  el.focus();
  el.select();
  doc().execCommand("insertText", false, keys);
}
// An address inside the site is "#..." or a relative path. One with a scheme (https:, data:, or an app's own)
// or that starts at the server's root is a way out of it.
const insideSite = (href) => href.startsWith("#") || !/^([a-z][a-z0-9+.-]*:|[/\\])/i.test(href);
const linksOut = () => $$("a[href]").map((a) => a.getAttribute("href")).filter((x) => !insideSite(x));
const focused = () => doc().activeElement;
const noInnerScroll = (el) => [win().getComputedStyle(el).overflowY, el.scrollHeight <= el.clientHeight + 1, el.classList.contains("fits") || el.classList.contains("tall")];
const sideways = () => Math.max(0, doc().documentElement.scrollWidth - win().innerWidth);
const styleOf = (el) => win().getComputedStyle(el);
// How far two colours are apart, counted the way the accessibility guidelines count it: 4.5 or more for words
// to be read, 3 or more for the edge of a control. The colours are the browser's own "rgb(r, g, b)".
function contrast(a, b) {
  const light = (c) => {
    const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map((v) => { const s = Number(v) / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [light(a), light(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const pageColour = () => styleOf(doc().body).backgroundColor;

// A file the site hands over (a recipe file, a calendar file) is caught before the browser saves it: a test
// run must leave nothing in the Downloads folder, and the checks can read the name and the words of the file.
const handed = [];
function catchFiles() {
  const proto = win().HTMLAnchorElement.prototype, real = proto.click;
  proto.click = function click() {
    if (!this.hasAttribute("download")) return real.call(this);
    handed.push({ name: this.getAttribute("download"), words: fetch(this.href).then((x) => x.text()) });
    return undefined;
  };
}
async function lastFile() {
  const file = handed.pop();
  return file ? [file.name, await file.words] : [null, null];
}

let loads = 0;
async function open(hash) {
  // a fresh load of the site at an address
  loads += 1;
  await new Promise((res) => { frame.addEventListener("load", res, { once: true }); frame.src = "../index.html?load=" + loads + hash; });
  catchFiles();
  await until("the site at " + hash, () => app() && app().dataset.page);
}
async function reload() {
  await new Promise((res) => { frame.addEventListener("load", res, { once: true }); win().location.reload(); });
  catchFiles();
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
  // a status line has to be in the page before its words arrive, or a screen reader never hears them
  check(where + ": no status line is taken out of the page while it is empty",
    $$("[role=status]").filter((el) => win().getComputedStyle(el).display === "none").map((el) => el.className), []);
  check(where + ": every link stays inside the site", linksOut(), []);
}

async function flow(name, fn) {
  try { await fn(); } catch (e) {
    failed += 1;
    say("FAIL " + name + " stopped: " + (e && e.message ? e.message : e));
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
    if ("wakeLock" in win().navigator) {
      check("recipe: Keep screen on sits with the steps", Boolean($(".method .steps-head #keep-on")), true);
      check("recipe: its status line is in the page while it is empty, and takes no room there",
        [$(".switch-note").getAttribute("role"), text($(".switch-note")), win().getComputedStyle($(".switch-note")).display === "none", $(".switch-note").getBoundingClientRect().height], ["status", "", false, 0]);
    }
    check("recipe: a line for the paper names the cookbook and the chapter, and is not on the screen", [text($(".print-only")), win().getComputedStyle($(".print-only")).display], ["Hi, My Name is Food, Grub", "none"]);
    audit("recipe");
    // a window shorter than the ingredient list
    frame.setAttribute("height", "500");
    await open("#/r/pad-thai-baby");
    await until("the ingredients marked taller than the window", () => $(".recipe .cols .left").classList.contains("tall"));
    win().scrollTo(0, 800);
    await settled(() => Math.round($(".recipe .cols .left").getBoundingClientRect().bottom) === 500 - 16);
    const col = $(".recipe .cols .left").getBoundingClientRect();
    check("recipe: in a short window the ingredients ride up until their last line shows, then stay there beside the steps",
      [Math.round(col.bottom), col.top < 0, noInnerScroll($(".recipe .cols .left"))[0]], [500 - 16, true, "visible"]);
    frame.setAttribute("height", "900");
    await open("#/r/larp-chicken-and-sticky-rice");
    await go("#/r/larp-chicken-and-sticky-rice", "recipe");
    check("recipe: a guessed total time is said to be a guess, counted in hours beside the tag", [text($(".guess")), /\d days?\b/.test(text($(".guess")))],
      ["The total time is a guess. Plans count it as " + totalText(larp.total_minutes, larp.days) + ", and you can change that in Prep.", false]);
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
    check("shopping: Copy list is the main action, the one filled button, and it is a button, not a link",
      [$$("#app .primary").map((b) => [b.tagName, text(b)]), button("Copy list").getAttribute("aria-disabled"), button("Copy list").title], [[["BUTTON", "Copy list"]], null, ""]);
    check("shopping: Copy list comes before the list in the page, and sits to its right in a computer window",
      [$(".stack").firstElementChild === button("Copy list"), Boolean($(".stack").compareDocumentPosition($("ul.shop")) & 4), $(".cols.side .left").getBoundingClientRect().left < $(".stack").getBoundingClientRect().left,
        Math.abs($(".stack").getBoundingClientRect().top - $(".cols.side .left").getBoundingClientRect().top) < 4], [true, true, true, true]);
    check("shopping: the list stays in the site: with things on it, the page has links, and every one stays inside the site", [$$("a[href]").length > 6, linksOut()], [true, []]);
    // what the browser would have put on the clipboard is caught here, so the check can read it
    let copied = null;
    Object.defineProperty(win().navigator, "clipboard", { configurable: true, value: { writeText: async (words) => { copied = words; } } });
    button("Copy list").click();
    await settled(() => copied !== null && said());
    check("shopping: Copy list copies what is left to get, one per line, the same thing from two recipes once with both amounts",
      [copied, mergedLines(wanted).includes("Garlic (2 cloves + 2 cloves)"), mergedLines(wanted).length < wanted.length], [mergedLines(wanted).join("\n"), true, true]);
    check("shopping: and says how many, and what to do next, naming no app", said(), "Copied " + mergedLines(wanted).length + ". Paste it wherever you keep your list.");
    items()[1].querySelector("input").click();
    check("shopping: tick one as got", [items()[1].className, text($(".count"))], ["got", (wanted.length - 1) + " to get, 1 got. Kept on this device."]);
    copied = null;
    button("Copy list").click();
    await settled(() => copied !== null);
    check("shopping: a ticked thing is not copied", copied, mergedLines(wanted.filter((_, n) => n !== 1)).join("\n"));
    win().navigator.clipboard.writeText = async () => { throw new Error("refused by the test"); };
    button("Copy list").click();
    await settled(() => $(".copybox"));
    check("shopping: where the browser will not copy, the list is put in a box to copy by hand, and the page says so",
      [$(".copybox") && $(".copybox").value, said(), focused() === $(".copybox")],
      [mergedLines(wanted.filter((_, n) => n !== 1)).join("\n"), "This browser would not copy. The text is in the box below: select it and copy it.", true]);
    // pressed twice before the browser has answered the first press: still one box
    let refusals = 0;
    win().navigator.clipboard.writeText = async () => { refusals += 1; throw new Error("refused by the test"); };
    button("Copy list").click();
    button("Copy list").click();
    await settled(() => refusals === 2 && $(".copybox")); // both presses clear the box at once, so it is back only when both are answered
    check("shopping: Copy list pressed twice where copying is refused leaves one box, not two", [refusals, $$(".copybox").length, focused() === $(".copybox")], [2, 1, true]);
    delete win().navigator.clipboard; // the browser's own again
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
    check("shopping: with the list empty there is nothing folded away to set up, and still no link out of the site", [$("#app details"), $$("#app a[href]").length, linksOut()], [null, 0, []]);
    type($("#own-item"), "Milk");
    $("form.add-own").requestSubmit();
    items()[0].querySelector("input").click();
    const copyList = button("Copy list");
    let asked = 0;
    Object.defineProperty(win().navigator, "clipboard", { configurable: true, value: { writeText: async () => { asked += 1; } } });
    copyList.focus();
    copyList.click(); // Enter and Space on a button are this same press
    check("shopping: with everything ticked, Copy list is marked as unavailable but can still be reached, and says why to the mouse and to the keyboard",
      [copyList.getAttribute("aria-disabled"), copyList.disabled, copyList.tabIndex, focused() === copyList, copyList.title, said(), asked],
      ["true", false, 0, true, "Everything is ticked, so there is nothing to copy.", "Everything is ticked, so there is nothing to copy.", 0]);
    // It still answers a press, and a touch screen has no tooltip, so its words have to be readable: it is
    // not faded. The fill goes and it rests as an outline, like no other state of the button.
    const resting = styleOf(copyList);
    check("shopping: unavailable, Copy list rests as a quiet outline whose words can still be read against the page",
      [resting.opacity, resting.backgroundColor, contrast(resting.color, pageColour()) >= 4.5, contrast(resting.borderTopColor, pageColour()) >= 3, resting.cursor],
      ["1", "rgba(0, 0, 0, 0)", true, true, "default"]);
    items()[0].querySelector("input").click();
    check("shopping: unticked again, Copy list is back, filled, and the page no longer says everything is ticked",
      [button("Copy list").getAttribute("aria-disabled"), button("Copy list").title, said(), styleOf(button("Copy list")).backgroundColor === "rgba(0, 0, 0, 0)",
        contrast(styleOf(button("Copy list")).color, styleOf(button("Copy list")).backgroundColor) >= 4.5], [null, "", "", false, true]);
    items()[0].querySelector("input").click();
    delete win().navigator.clipboard;
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
    // the Eat at box read as empty, as it does for a moment whenever a time is typed over
    const keptPlan = () => JSON.parse(localStorage.getItem("grub.plan")).data;
    type($("#plan-time"), "");
    check("prep: with the Eat at box emptied, the day he set is left alone and the plan asks for a time",
      [$("#plan-day").value, text($(".plan-out")), [keptPlan().date, keptPlan().dayChosen, keptPlan().time]], [day, "Pick a day and a time.", [day, true, ""]]);
    $("ul.cooking li[data-id=pad-thai-baby] button.remove").click();
    pick($("#plan-pick"), "pad-thai-baby");
    button("Add to the plan").click();
    check("prep: and stays through other changes to the plan while there is no time", [$("#plan-day").value, keptPlan().dayChosen, cooking()], [day, true, ["Larp Chicken & Sticky Rice", "Pad Thai, Baby"]]);
    type($("#plan-time"), "19:15");
    check("prep: a new time typed in keeps the day he set", [$("#plan-day").value, keptPlan().dayChosen, timeline().pop()], [day, true, [dayName(meal) + " at " + clock(meal + 45 * 60000), "Eat"]]);
    type($("#plan-time"), "");
    await reload();
    check("prep: a reload while the box was empty brings back the last real time, with the day he set", [$("#plan-time").value, $("#plan-day").value, keptPlan().dayChosen], ["19:15", day, true]);
    $("ul.cooking li[data-id=larp-chicken-and-sticky-rice] button.remove").click();
    pick($("#plan-pick"), "larp-chicken-and-sticky-rice");
    button("Add to the plan").click();
    type($("#plan-time"), "18:30");
    check("prep: back as it was", [cooking(), timeline()], [["Pad Thai, Baby", "Larp Chicken & Sticky Rice"], [start("Larp Chicken & Sticky Rice", 1440), start("Pad Thai, Baby", 60), eat]]);
    const hours = () => $("#hours-larp-chicken-and-sticky-rice"), mins = () => $("#mins-larp-chicken-and-sticky-rice");
    const note = () => text($("ul.cooking li[data-id=larp-chicken-and-sticky-rice] .guess-line .warn"));
    check("prep: a guessed time says so and can be changed for this plan, in hours and minutes",
      [text($("ul.cooking li[data-id=larp-chicken-and-sticky-rice] .guess-line p")), hours().value, mins().value, $("#mins-pad-thai-baby")],
      ["The total time for this one is a guess. Change it if you know better. It only changes this plan.", "24", "", null]);
    type(hours(), "10");
    check("prep: his time moves the start", timeline(), [start("Larp Chicken & Sticky Rice", 600), start("Pad Thai, Baby", 60), eat]);
    type(hours(), "");
    // the larp carries the tag, so its own time is said in hours here, never as "1 day" beside "2-day recipe"
    const larpOwn = "The plan can't use that (plain numbers, two weeks at most). Using the recipe's " + totalText(larp.total_minutes, larp.days) + ".";
    check("prep: a time the plan cannot use is said, and the recipe's own is used", [note(), timeline()[0], /\d days?\b/.test(note())],
      [larpOwn, start("Larp Chicken & Sticky Rice", 1440), false]);
    check("prep: the plan says a tagged recipe's time in hours too", text($$("ol.timeline li .sub")[0]), "Takes " + totalText(larp.total_minutes, larp.days) + ", which is a guess.");
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
    typeKeys(hours(), "1e");
    check("prep: text the browser will not hand over in a time box is said, and is not counted as an empty box",
      [hours().validity.badInput, hours().value, mins().value, note(), timeline()[0]],
      [true, "", "30", larpOwn, start("Larp Chicken & Sticky Rice", 1440)]);
    type(hours(), "");
    check("prep: with the box cleared the minutes count again", [hours().validity.badInput, note(), timeline()], [false, "", [start("Pad Thai, Baby", 60), start("Larp Chicken & Sticky Rice", 30), eat]]);
    check("prep: one calendar button, a copy button and a clear button, the same on every device",
      [$$("#app .right > .row button").map(text), button("Add to Calendar").closest(".row").hidden, $$("#app button").filter((b) => /calendar/i.test(text(b))).length], [["Add to Calendar", "Copy plan", "Clear plan"], false, 1]);
    button("Add to Calendar").click();
    const [icsName, ics] = await lastFile();
    check("prep: Add to Calendar hands over one calendar file with an event for each recipe, in the form every calendar reads",
      [icsName, ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"), ics.endsWith("END:VCALENDAR\r\n"), ics.split("BEGIN:VEVENT").length - 1, ics.includes("SUMMARY:Cook: Pad Thai\\, Baby")],
      ["Meal plan " + day + ".ics", true, true, 2, true]);
    // Opening the file is the wrong first step on most calendars (Google Calendar only imports on a computer,
    // Outlook wants Upload from file), so the words say to import it and the note says where.
    check("prep: and says what to do with it, which is to import it, and points at the note that says how",
      [text($("#app .right > .status")), Boolean($("#app .right > .status").compareDocumentPosition($(".plan-note")) & 4)],
      ["Downloaded the calendar file. Import it into your calendar to add the events. The note below says how.", true]);
    const notes = $$(".plan-note p").map(text);
    check("prep: the note under the plan says what the button gives", notes[0], "The plan is kept on this device until you clear it. Add to Calendar downloads one calendar file (.ics) with an event for each recipe.");
    check("prep: and how the file gets into a calendar: where importing lives in the two most used, which add it when it is opened, that the alert may not come with it, and Copy plan for any that will not take it",
      notes[1], "To add it, import the file into your calendar on a computer: in Google Calendar, Settings, then Import & export; in Outlook, Add calendar, then Upload from file."
        + " Apple Calendar and some phone calendars add the events when you open the file."
        + " Some calendars, Google Calendar among them, may drop the alert picked here and use their own, so check an event after you import it."
        + " If yours will not take the file, Copy plan gives you the same plan as text to paste anywhere.");
    check("prep: the note never tells anyone to open the file as the way in, and Copy plan, which it names, is on the page",
      [/\bopen it\b/i.test(notes.join(" ") + text($("#app .right > .status"))), notes.length, Boolean(button("Copy plan"))], [false, 2, true]);
    check("prep: nothing on the page opens a file through an address of its own", [linksOut(), win().location.href.startsWith("http")], [[], true]);
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
    // Cleared while the Eat at box is empty: the plan then holds no day, and the Day box must not go on showing one
    pick($("#plan-pick"), "pad-thai-baby");
    button("Add to the plan").click();
    type($("#plan-day"), day);
    type($("#plan-time"), "");
    check("prep: (a day set and the Eat at box emptied, before the plan is cleared)", [$("#plan-day").value, keptPlan().date, keptPlan().dayChosen], [day, day, true]);
    button("Clear plan").click();
    button("Yes, clear it").click();
    check("prep: cleared while the Eat at box was empty, the Day box shows what the plan holds, which is no day",
      [$("#plan-day").value, [keptPlan().date, keptPlan().dayChosen, keptPlan().time], cooking()], ["", ["", false, ""], []]);
    pick($("#plan-pick"), "pad-thai-baby");
    button("Add to the plan").click();
    check("prep: a recipe added then is asked for a day and a time, beside two empty boxes", [text($(".plan-out")), $("#plan-day").value, $("#plan-time").value], ["Pick a day and a time.", "", ""]);
    type($("#plan-time"), "18:30");
    check("prep: and a time typed in gives the first day that works, as on a first visit",
      [$("#plan-day").value, keptPlan().dayChosen, timeline().length], [defaultDay(Date.now(), "18:30", padThai.total_minutes), false, 2]);
    button("Clear plan").click();
    button("Yes, clear it").click();
  });

  let toastHash = "";
  await flow("draft", async () => {
    await go("#/draft", "draft");
    check("draft: no drafts yet, so no list", $(".drafts"), null);
    check("draft: says honestly that saving to the site is not built, and where the file goes",
      [text($(".finish h2")), text($(".finish")).includes("Saving straight to the site isn't built yet."), text($(".finish")).includes("It goes in the recipes folder.")], ["Recipe file", true, true]);
    check("draft: the form says the total time is required", text($("fieldset.time legend")), "Total time, start to finish (every recipe needs one)");
    check("draft: that some browsers clear what is kept is said to everyone, as a fact, with the one thing that always works",
      text($(".lapse")), "Some browsers clear what a site keeps on a device after a week or so without a visit. To keep a draft for good, download its recipe file.");
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
    type($("#f-tips"), "1. Eat it hot.\n2) Don't burn it.\n2 slices is plenty");
    check("draft: tips pasted with numbers lose them too, and a tip that starts with an amount keeps it", $$(".preview ul.tips li").map(text), ["Eat it hot.", "Don't burn it.", "2 slices is plenty"]);
    type($("#f-tips"), "");
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
    typeKeys($("#f-hours"), "1e");
    check("draft: text the browser will not hand over in a time box is said the same way, and is not counted as an empty box beside the 30 minutes",
      [$("#f-hours").validity.badInput, $("#f-hours").value, $("#f-minutes").value, text($("#takes")), text($(".needed")), $("#recipe-file").value],
      [true, "", "30", "The time boxes take numbers only, like 1 hour 30 minutes.", "No recipe file yet. The time boxes take numbers only, like 1 hour 30 minutes.", ""]);
    button("Copy recipe file").click();
    check("draft: and no file is handed over while it is there", text($(".finish .status")), "No recipe file yet. The time boxes take numbers only, like 1 hour 30 minutes.");
    typeKeys($("#f-hours"), "--");
    check("draft: two minus signs the same", [$("#f-hours").validity.badInput, text($("#takes"))], [true, "The time boxes take numbers only, like 1 hour 30 minutes."]);
    type($("#f-hours"), "50");
    type($("#f-minutes"), "");
    check("draft: a day or more under hours is questioned, and with the days control moved to 3 days the time is said in hours", [text($("#takes")), $("#f-days").value],
      ["Takes 50 hours, start to finish. That is a day or more. If you meant minutes, move the number to the minutes box.", "3"]);
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
    const [fileName, fileWords] = await lastFile();
    check("draft: the file is handed over once nothing is missing", [text($(".finish .status")), fileName, JSON.parse(fileWords).title, JSON.parse(fileWords).total_minutes, fileWords.endsWith("}\n")],
      ["Downloaded test-toast.json. Look in Downloads.", "test-toast.json", "Test Toast", 50, true]);
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
    const keptDrafts = () => JSON.parse(localStorage.getItem("grub.drafts")).data.map((x) => x.fields.title);
    type($("#f-title"), rolls.title + "!");
    await until("the copy's own address", () => /^#\/draft\/[a-z0-9]+$/.test(win().location.hash));
    const shortLived = win().location.hash;
    check("draft: a changed copy is kept as a draft", keptDrafts(), [rolls.title + "!", "Test Toast"]);
    type($("#f-title"), rolls.title);
    check("draft: changed back to read exactly as the recipe does, it is not kept, and its address is the copy's again",
      [keptDrafts(), win().location.hash, app().dataset.hash, JSON.stringify(JSON.parse($("#recipe-file").value)) === JSON.stringify(clean(rolls))],
      [["Test Toast"], "#/draft?copy=spring-rolls", "#/draft?copy=spring-rolls", true]);
    $("#f-separate").click();
    await until("the separate copy's own address", () => /^#\/draft\/[a-z0-9]+$/.test(win().location.hash));
    check("draft: an unchanged copy marked as a separate recipe is kept", keptDrafts(), [rolls.title, "Test Toast"]);
    $("#f-separate").click();
    check("draft: and not kept once the mark is taken off again", [keptDrafts(), win().location.hash], [["Test Toast"], "#/draft?copy=spring-rolls"]);
    await go("#/", "home");
    check("home: a copy changed and changed back is not counted", doorCounts().Draft, "1 draft");
    await go(shortLived, "draft");
    check("draft: the address it had for a moment says it is gone", text($("#app p")), "That draft isn't on this device.");
    // a copy he kept before this was put right, and one of a version the site no longer has
    const older = { ...rolls, version: rolls.version + 5 };
    store("drafts", [draftFromRecipe(rolls, "dsame1", 5), draftFromRecipe(older, "dolder1", 6), ...JSON.parse(localStorage.getItem("grub.drafts")).data]);
    win().location.hash = "#/draft/dsame1";
    await until("the unchanged copy opened as a new copy", () => app().dataset.hash === "#/draft?copy=spring-rolls" && $("#f-title"));
    check("draft: an unchanged copy kept by an earlier visit is let go when it is opened", [keptDrafts(), $("#f-title").value], [["Test Toast", rolls.title], rolls.title]);
    await go("#/draft/dolder1", "draft");
    type($("#f-title"), rolls.title + "?");
    type($("#f-title"), rolls.title);
    check("draft: an unchanged copy of a version the site no longer has is kept, because it may be the only one", [keptDrafts(), win().location.hash], [[rolls.title, "Test Toast"], "#/draft/dolder1"]);
    button("Delete this draft").click();
    button("Yes, delete it").click();
    await until("the list of drafts", () => app().dataset.hash === "#/draft" && $(".drafts"));
    check("draft: and can still be deleted by hand", keptDrafts(), ["Test Toast"]);
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

  await flow("two-day recipes", async () => {
    // A recipe that cannot be made in one day says so wherever its time is shown, can be found by that, and
    // the form can say it. The larp stands for the tagged recipes and the first recipe without the tag for the
    // same-day ones. Nothing here counts on how many recipes there are, on which others carry the tag, or on
    // his own words for a time: what a page should say is worked out from the data file.
    const TAG = daysLabel(larp);
    const tagged = data.recipes.filter((r) => daysLabel(r)), sameDay = data.recipes.find((r) => !daysLabel(r));
    const rowOf = (title) => $$("ul.rows li").find((li) => text(li.querySelector(".t")) === title);
    const tagOf = (title) => (rowOf(title) && rowOf(title).querySelector(".days") ? text(rowOf(title).querySelector(".days")) : null);
    const stopped = (m) => m + (/[.!?]$/.test(m) ? "" : ".");
    const metaWords = (r) => [timeFacts(r).ready].concat(daysLabel(r) || [], r.yield ? (/^(serves|makes)/i.test(r.yield) ? r.yield : "Serves " + r.yield) : [], r.source ? "Credit: " + r.source : [])
      .map(stopped).join(" ");
    check("days: the larp carries the tag, the tag says its number of days, and there is a same-day recipe to hold it against",
      [TAG, larp.days > 1, Boolean(sameDay)], [larp.days + "-day recipe", true, true]);

    await go("#/browse", "browse");
    check("days: in Browse every tagged recipe's row carries its tag beside its time, with the time counted in hours, and a same-day recipe's row has none",
      [text(rowOf(larp.title).querySelector(".m")), /\d days?\b/.test(text(rowOf(larp.title).querySelector(".time"))), tagOf(sameDay.title), text(rowOf(sameDay.title).querySelector(".m")), $$("ul.rows .days").map(text)],
      [shortTime(larp) + ", " + TAG, false, null, shortTime(sameDay), tagged.map((r) => daysLabel(r))]);
    // The times are one column: a row's tag sits to the left of its time, so the time ends where every other
    // row's time ends, and a tagged row is no taller than the one above it. In a narrower window, where the
    // tag has no room beside the time, it goes under the time and ends at the same edge.
    const edge = (r) => Math.round(rowOf(r.title).querySelector(".time").getBoundingClientRect().right * 2) / 2;
    const tall = (r) => Math.round(rowOf(r.title).getBoundingClientRect().height * 2) / 2;
    const rect = (sel) => rowOf(larp.title).querySelector(sel).getBoundingClientRect();
    const oneLine = data.recipes.filter((r) => rowOf(r.title).querySelector(".t").getBoundingClientRect().height < 30);
    check("days: in a computer window every row's time ends at the same right edge, the tag is to the left of its time on the same line, and the tagged row is as tall as the others",
      [[...new Set(data.recipes.map(edge))].length, rect(".days").right <= rect(".time").left - 6, Math.abs(rect(".days").top - rect(".time").top) < 6, [...new Set(oneLine.map(tall))].length, oneLine.includes(larp)],
      [1, true, true, 1, true]);
    frame.setAttribute("width", "900");
    await settled(() => win().innerWidth === 900);
    const beside = rect(".days").right <= rect(".time").left - 6 && Math.abs(rect(".days").top - rect(".time").top) < 6;
    const under = rect(".days").top >= rect(".time").bottom - 0.5 && Math.abs(rect(".days").right - rect(".time").right) < 0.75;
    check("days: in a narrow two-column window the times still end at one right edge, with the tag to the left of its time or under it and flush with it",
      [[...new Set(data.recipes.map(edge))].length, beside || under, sideways()], [1, true, 0]);
    frame.setAttribute("width", "1280");
    await settled(() => win().innerWidth === 1280);
    check("days: the tag is the page's own type in a thin outline: no fill, no capitals, no letter-spacing, not monospaced, never split over two lines", (() => {
      const s = win().getComputedStyle(rowOf(larp.title).querySelector(".days"));
      return [s.backgroundColor, s.textTransform, s.letterSpacing, /mono|courier/i.test(s.fontFamily), s.borderTopStyle, s.borderTopWidth, s.whiteSpace];
    })(), ["rgba(0, 0, 0, 0)", "none", "normal", false, "solid", "1px", "nowrap"]);
    const timeNames = () => $$(".filter[aria-label=Time] button").map(text);
    check("days: the Time choices end with the new one, after the ones that were there", timeNames(), ["Any", "30 minutes or less", "An hour or less", "Two days or more"]);
    button("Two days or more").click();
    const twoOrMore = narrow(data.recipes, { minDays: 2 }).map((r) => r.title);
    check("days: Two days or more lists the tagged recipes, the larp among them, and the address keeps the choice",
      [rowTitles(), rowTitles().includes(larp.title), tagOf(larp.title), win().location.hash, button("Two days or more").getAttribute("aria-pressed"), button("Any").getAttribute("aria-pressed"), text($(".count"))],
      [twoOrMore, true, TAG, "#/browse?time=days", "true", "false", twoOrMore.length + (twoOrMore.length === 1 ? " recipe" : " recipes") + " of " + data.recipes.length]);
    await reload();
    check("days: a reload comes back to the same list", [rowTitles(), button("Two days or more").getAttribute("aria-pressed")], [twoOrMore, "true"]);
    button("An hour or less").click();
    check("days: one Time choice at a time, and An hour or less never lists a tagged recipe",
      [button("Two days or more").getAttribute("aria-pressed"), rowTitles().includes(larp.title), $$("ul.rows .days").length, rowTitles().length > 0, win().location.hash], ["false", false, 0, true, "#/browse?time=60"]);
    button("30 minutes or less").click();
    check("days: nor does 30 minutes or less", [rowTitles().includes(larp.title), $$("ul.rows .days").length], [false, 0]);
    button("Two days or more").click();
    button("Two days or more").click();
    check("days: pressed again, the choice is off and the address is plain", [rowTitles().length, win().location.hash, button("Any").getAttribute("aria-pressed")], [data.recipes.length, "#/browse", "true"]);
    const found = {}, wanted = {};
    const number = ["", "", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen"][larp.days];
    for (const typed of [larp.days + " day", larp.days + "-day", number + " day", TAG, TAG + "s"]) {
      type($("#search"), typed);
      found[typed] = [rowTitles().includes(larp.title), rowTitles()];
      wanted[typed] = [true, narrow(data.recipes, { query: typed }).map((r) => r.title)];
    }
    check("days: typing the tag's words in the search finds it, with or without the word recipe or recipes after them", found, wanted);
    type($("#search"), TAG);
    check("days: and the tag shows in the search results", [tagOf(larp.title), win().location.hash], [TAG, "#/browse?q=" + encodeURIComponent(TAG).replace(/%20/g, "+")]);
    type($("#search"), (larp.days + 1) + " day");
    check("days: another number of days does not find it", rowTitles().includes(larp.title), false);
    type($("#search"), "");
    audit("browse with a tagged recipe");

    await go("#/r/larp-chicken-and-sticky-rice", "recipe");
    const meta = () => $(".recipe-head .meta");
    const box = (el) => el.getBoundingClientRect();
    const tagIn = (el) => el.querySelector(".days");
    check("days: the recipe page says it right after the time", [text(meta()), text(tagIn(meta())), tagIn(meta()).previousElementSibling.previousElementSibling === meta().querySelector("span")],
      [metaWords(larp), TAG, true]);
    // The tag is an outlined word between two sentences. A plain word space on each side left it jammed against
    // them, so each side has a wider space, the same on both sides, and still a space (it can end a line).
    const before = tagIn(meta()).previousElementSibling, after = tagIn(meta()).nextElementSibling.nextElementSibling;
    const wordSpace = (() => { const s = doc().createElement("span"); s.textContent = "a a"; const one = doc().createElement("span"); one.textContent = "aa"; meta().append(s, one); const w = box(s).width - box(one).width; s.remove(); one.remove(); return w; })();
    check("days: on the recipe page the tag has clear room on both sides, more than a word space and the same each side",
      [[before.className, after.className, before.textContent, after.textContent], Math.round(box(tagIn(meta())).left - box(before.previousElementSibling).right) >= Math.round(wordSpace) + 5,
        after.nextElementSibling ? Math.round(box(after.nextElementSibling).left - box(tagIn(meta())).right) >= Math.round(wordSpace) + 5 : true, Math.round(box(tagIn(meta())).left - box(before.previousElementSibling).right) <= 16],
      [["tag-gap", "tag-gap", " ", " "], true, true, true]);
    const pdfLink = $$(".actions a").find((a) => text(a) === "Tablet PDF").getAttribute("href");
    const olderPdfs = [];
    for (let v = 1; v < larp.version; v += 1) if ((await fetch("../pdf/" + larp.id + "-v" + v + ".pdf", { method: "HEAD" })).ok) olderPdfs.push(v);
    check("days: its Tablet PDF link is the file of the version the site has now, that file is there, and no file of an earlier version is left beside it",
      [pdfLink, (await fetch("../" + pdfLink, { method: "HEAD" })).ok, olderPdfs], ["pdf/" + larp.id + "-v" + larp.version + ".pdf", true, []]);
    $(".actions button.star").click();
    await go("#/r/" + sameDay.id, "recipe");
    check("days: a same-day recipe's page has no tag", [$("#app .days"), $("#app .tag-gap"), text(meta())], [null, null, metaWords(sameDay)]);
    await go("#/saved", "saved");
    check("days: Saved shows it in the row too, after the chapter and the time", [text(rowOf(larp.title).querySelector(".m")), $$("ul.rows .days").length], [chapterOf(larp) + ", " + shortTime(larp) + ", " + TAG, 1]);
    rowOf(larp.title).querySelector("button.star").click();

    await go("#/r/larp-chicken-and-sticky-rice", "recipe");
    button("Plan a meal").click();
    await until("the prep page", () => app().dataset.page === "prep");
    pick($("#plan-pick"), sameDay.id);
    button("Add to the plan").click();
    const cookLine = (id) => $("ul.cooking li[data-id=" + id + "] .cook-line");
    const larpLine = cookLine("larp-chicken-and-sticky-rice");
    check("days: Prep says it on the recipe's own line under What you're cooking, right after its name, and not on a same-day recipe's",
      [$$("ul.cooking li .t").map(text), text(larpLine.querySelector(".days")), larpLine.querySelector(".days").previousElementSibling === larpLine.querySelector("a.t"), cookLine(sameDay.id).querySelector(".days"),
        Boolean(larpLine.querySelector(".remove"))],
      [[larp.title, sameDay.title], TAG, true, null, true]);
    audit("prep with a tagged recipe");
    button("Clear plan").click();
    button("Yes, clear it").click();

    await go("#/draft", "draft");
    const daysBox = () => $("#f-days"), daysSaid = () => text($("#days-note")), needed = () => text($(".needed"));
    const file = () => JSON.parse($("#recipe-file").value);
    check("days: the form has one small labelled control under the total time, from the same day up to 14 days",
      [text($("label[for=f-days] > span")), daysBox().tagName, $$("#f-days option").map(text), daysBox().value,
        Boolean($("fieldset.time").compareDocumentPosition(daysBox()) & 4), Boolean(daysBox().compareDocumentPosition($("#f-time-text")) & 4)],
      ["Days it needs", "SELECT", ["Same day"].concat(Array.from({ length: 13 }, (_, n) => (n + 2) + " days")), "", true, true]);
    check("days: the line that says why it moved is a status line, in the page while it is empty, taking no room",
      [$("#days-note").getAttribute("role"), daysSaid(), win().getComputedStyle($("#days-note")).display === "none", $("#days-note").getBoundingClientRect().height], ["status", "", false, 0]);
    type($("#f-title"), "Soaked Beans");
    await until("the draft's own address", () => /^#\/draft\/[a-z0-9]+$/.test(win().location.hash));
    const beansHash = win().location.hash;
    type($("#f-ingredients"), "1 lb beans");
    type($("#f-steps"), "Soak the beans overnight.\nCook them.");
    type($("#f-hours"), "14");
    check("days: under 24 hours the control is left alone, and the file has no days", [daysBox().value, daysSaid(), "days" in file(), $(".preview .days")], ["", "", false, null]);
    pick(daysBox(), "2");
    check("days: picking 2 days puts the field in the recipe file, after the total time, and the tag in the preview",
      [file().days, Object.keys(file()).join(" "), text($(".preview .meta .days")), text($(".preview .meta")), needed()],
      [2, "schema id version created updated title total_minutes days tags ingredients steps", "2-day recipe", "Ready in 14 hours. 2-day recipe.", "Nothing is missing. The recipe file is ready."]);
    await reload();
    check("days: kept with the draft across a reload", [win().location.hash, daysBox().value, file().days], [beansHash, "2", 2]);
    pick(daysBox(), "");
    check("days: set back to Same day, the field leaves the file and the tag leaves the preview", ["days" in file(), $(".preview .days")], [false, null]);
    type($("#f-hours"), "24");
    check("days: at 24 hours the control moves to 2 days by itself, and a line says why",
      [daysBox().value, daysSaid(), file().days, needed()], ["2", "The total time is 24 hours or more, so this is set to 2 days.", 2, "Nothing is missing. The recipe file is ready."]);
    type($("#f-hours"), "50");
    check("days: and on to 3 days at 48 hours or more", [daysBox().value, daysSaid(), file().days], ["3", "The total time is 48 hours or more, so this is set to 3 days.", 3]);
    // A slip while typing must not move the control: "24e" is no number, so the page says it cannot read the
    // time and leaves the days alone, in place of taking them back to Same day as if the time were gone.
    pick(daysBox(), "");
    type($("#f-hours"), "24");
    const quietNote = styleOf($("#days-note")).color, plainEdge = styleOf($("#f-title")).borderTopColor;
    typeKeys($("#f-hours"), "24e");
    check("days: a slip while typing the hours (24e) leaves the days where they were, and the page says it cannot read the time",
      [$("#f-hours").validity.badInput, daysBox().value, daysSaid(), text($("#takes")), $("#takes").classList.contains("warn")],
      [true, "2", "The total time is 24 hours or more, so this is set to 2 days.", "The time boxes take numbers only, like 1 hour 30 minutes.", true]);
    typeKeys($("#f-hours"), "50");
    check("days: and with the slip put right the control moves on as it would have", [daysBox().value, daysSaid(), $("#takes").classList.contains("warn")],
      ["3", "The total time is 48 hours or more, so this is set to 3 days.", false]);
    check("days: a line that only says why the control moved is quiet, and the control is not marked as wrong",
      [$("#days-note").classList.contains("warn"), daysBox().hasAttribute("aria-invalid"), styleOf($("#days-note")).color === quietNote, styleOf(daysBox()).borderTopColor === plainEdge], [false, false, true, true]);
    pick(daysBox(), "2");
    const tooFew = "The total time is 48 hours or more, so this recipe needs at least 3 days. Under Days it needs, pick 3 days or more.";
    check("days: choosing fewer days than the time allows is refused in plain words that name the recipe and the control, where the other problems show and beside the control, and no file is made",
      [daysBox().value, needed(), daysSaid(), $("#recipe-file").value], ["2", "No recipe file yet. " + tooFew, tooFew, ""]);
    check("days: a refusal does not look like the quiet note: the line is in the warning colour, the control is marked as wrong and edged in the same colour, and the colour can be read on the page",
      [$("#days-note").classList.contains("warn"), daysBox().getAttribute("aria-invalid"), styleOf($("#days-note")).color === quietNote, styleOf(daysBox()).borderTopColor === styleOf($("#days-note")).color,
        styleOf(daysBox()).borderTopColor === plainEdge, contrast(styleOf($("#days-note")).color, pageColour()) >= 4.5, $("#days-note").getAttribute("role")],
      [true, "true", false, true, false, true, "status"]);
    button("Copy recipe file").click();
    check("days: and Copy recipe file says the same and hands nothing over", text($(".finish .status")), "No recipe file yet. " + tooFew);
    pick(daysBox(), "5");
    check("days: more days than the least is the writer's call, and the warning look is gone with the refusal",
      [needed(), file().days, daysSaid(), $("#days-note").classList.contains("warn"), daysBox().hasAttribute("aria-invalid"), styleOf(daysBox()).borderTopColor === plainEdge],
      ["Nothing is missing. The recipe file is ready.", 5, "", false, false, true]);
    type($("#f-hours"), "24");
    check("days: a number he picked himself is not moved down for him", [daysBox().value, daysSaid(), file().days], ["5", "", 5]);
    pick(daysBox(), "");
    check("days: Same day picked for a day-long recipe is refused the same way", [daysBox().value, needed(), $("#recipe-file").value],
      ["", "No recipe file yet. The total time is 24 hours or more, so this recipe needs at least 2 days. Under Days it needs, pick 2 days or more.", ""]);
    type($("#f-hours"), "30");
    check("days: and the next time the total time is typed the control moves by itself again", [daysBox().value, daysSaid(), file().days],
      ["2", "The total time is 24 hours or more, so this is set to 2 days.", 2]);
    type($("#f-hours"), "");
    check("days: when the time that moved it is taken away, the control goes back to where it was, and says so", [daysBox().value, daysSaid()],
      ["", "The total time is under 24 hours now, so this is back to Same day."]);
    type($("#f-minutes"), "30");
    check("days: so 30 typed under hours by mistake and moved to minutes leaves no tag behind", [daysBox().value, daysSaid(), "days" in file(), file().total_minutes], ["", "", false, 30]);
    type($("#f-hours"), "24");
    $$("button.chip").find((b) => b.dataset.minutes === "60").click();
    check("days: a one-tap time takes it back the same way", [daysBox().value, daysSaid(), "days" in file(), file().total_minutes], ["", "The total time is under 24 hours now, so this is back to Same day.", false, 60]);
    audit("draft form with the days control");
    button("Delete this draft").click();
    button("Yes, delete it").click();
    await until("the list of drafts", () => app().dataset.hash === "#/draft" && $(".drafts"));
    check("days: the draft made for these checks is gone again", $$(".drafts .row-link .t").map(text).includes("Soaked Beans"), false);

    await go("#/draft?copy=larp-chicken-and-sticky-rice", "draft");
    const otherDays = larp.days < 14 ? larp.days + 1 : larp.days - 1;
    check("days: a recipe opened as a draft brings its days back, and left alone it is the same recipe file",
      [daysBox().value, daysSaid(), JSON.stringify(file()) === JSON.stringify(clean(larp)), text($(".preview .meta .days")), win().location.hash], [String(larp.days), "", true, TAG, "#/draft?copy=larp-chicken-and-sticky-rice"]);
    pick(daysBox(), String(otherDays));
    await until("the copy's own address", () => /^#\/draft\/[a-z0-9]+$/.test(win().location.hash));
    check("days: changing only the days makes it a changed copy, the next version", [file().days, file().version, text($(".preview .meta .days"))], [otherDays, larp.version + 1, otherDays + "-day recipe"]);
    pick(daysBox(), String(larp.days));
    check("days: and changed back, it is not kept", [win().location.hash, JSON.stringify(file()) === JSON.stringify(clean(larp))], ["#/draft?copy=larp-chicken-and-sticky-rice", true]);

    // A copy kept on this device from before the recipe changed on the site: here the larp as it was one version
    // back, before it had its days. Nothing in it is his own, so it must not come back as the recipe: opened,
    // it is let go and a copy of the recipe as it is now opens, with the tag.
    const earlier = { ...clean(larp), version: larp.version - 1, updated: larp.created };
    delete earlier.days;
    const keptNow = () => { const s = localStorage.getItem("grub.drafts"); return s ? JSON.parse(s).data : []; };
    const keptIds = () => keptNow().map((x) => x.id);
    store("drafts", [draftFromRecipe(earlier, "dstale1", 7), draftFromRecipe(earlier, "dstale2", 8), ...keptNow()]);
    await go("#/draft", "draft");
    check("days: (two copies of the larp as it was one version back are kept, as an earlier visit would have left them)",
      [keptIds().filter((id) => id.startsWith("dstale")), $$(".drafts .row-link .t").map(text).filter((t) => t === larp.title).length], [["dstale1", "dstale2"], 2]);
    win().location.hash = "#/draft/dstale1";
    await until("the stale copy opened as a copy of the recipe as it is now", () => app().dataset.hash === "#/draft?copy=larp-chicken-and-sticky-rice" && $("#f-title"));
    check("days: an unchanged copy from before the recipe changed is let go when it is opened by its own address, and the recipe as the site has it now opens in its place",
      [keptIds().includes("dstale1"), daysBox().value, text($(".preview .meta .days")), JSON.stringify(file()) === JSON.stringify(clean(larp)), file().version],
      [false, String(larp.days), TAG, true, larp.version]);
    await go("#/r/larp-chicken-and-sticky-rice", "recipe");
    button("Edit a copy as a draft").click();
    await until("the copy of the recipe as it is now", () => app().dataset.hash === "#/draft?copy=larp-chicken-and-sticky-rice" && $("#f-title"));
    check("days: and Edit a copy as a draft lets the other stale copy go the same way, in place of carrying on with the older words",
      [keptIds().includes("dstale2"), win().location.hash, daysBox().value, JSON.stringify(file()) === JSON.stringify(clean(larp))], [false, "#/draft?copy=larp-chicken-and-sticky-rice", String(larp.days), true]);
    // The same older copy with something of his own in it is his to keep. Its file must not go out under a
    // version number the site already has: it is numbered one past the later of the two.
    const mine = draftFromRecipe(earlier, "dstale3", 9);
    mine.fields.title = larp.title + " II";
    store("drafts", [mine, ...keptNow()]);
    await go("#/draft/dstale3", "draft");
    check("days: a changed copy from before the recipe changed is kept as it is, with the days it had then, and the form asks for the days the time needs before it makes a file",
      [keptIds().includes("dstale3"), $("#f-title").value, daysBox().value, needed(), $("#recipe-file").value],
      [true, larp.title + " II", "", "No recipe file yet. The total time is 24 hours or more, so this recipe needs at least 2 days. Under Days it needs, pick 2 days or more.", ""]);
    pick(daysBox(), String(larp.days));
    check("days: its file is one version past the site's, never the number the site already has",
      [file().id, file().version, file().title, file().days], [larp.id, larp.version + 1, larp.title + " II", larp.days]);
    check("days: and the note with the file says which version the copy was made from and which the site has now",
      text($("details.help p")), "This is " + larp.id + ".json, version " + (larp.version + 1) + ". It is a changed copy of " + larp.title + " as it was at version " + (larp.version - 1)
        + ". The site has a later version now, version " + larp.version + ", and this file replaces that one.");
    type($("#f-title"), larp.title);
    pick(daysBox(), "");
    check("days: changed back to the older words, the older copy is still kept (it is not what the site has), and the note says so",
      [keptIds().includes("dstale3"), win().location.hash, text($("details.help p"))],
      [true, "#/draft/dstale3", "The file shows up here once nothing is missing."]);
    button("Delete this draft").click();
    button("Yes, delete it").click();
    await until("the list of drafts", () => app().dataset.hash === "#/draft");
    check("days: the copies made for these checks are gone again", keptIds().filter((id) => id.startsWith("dstale")), []);

    // The narrowest window with the list beside the choices, where a row has the least room. The larp's row is
    // given the longest words a row can hold (as text), so the site's own styles do the wrapping: the title
    // keeps half the row, and the tag goes under the time before the title is squeezed into a sliver.
    frame.setAttribute("width", "900");
    await go("#/browse", "browse");
    const tight = rowOf(larp.title), part = (sel) => tight.querySelector(sel);
    const asItIs = [Math.abs(box(part(".time")).right - box(part(".m")).right) < 0.75, box(part(".t")).right <= box(part(".m")).left, box(part(".m")).right <= box(part(".row-link")).right + 0.5];
    part(".t").textContent = "Grandmother's Slow Fermented Cabbage with Chili, Garlic and a Great Deal of Patience";
    part(".time").textContent = "about 13 days 23 hours 59 minutes";
    part(".days").textContent = "14-day recipe";
    check("days: in a narrow two-column window the time ends at the right edge of the row, and with a long title and the longest time the title keeps half the row and the tag goes under the time, whole",
      [asItIs, sideways(), box(part(".t")).width >= box(part(".row-link")).width / 2 - 1, box(part(".t")).right <= box(part(".m")).left, box(part(".m")).right <= box(part(".row-link")).right + 0.5,
        box(part(".days")).top >= box(part(".time")).bottom - 0.5, box(part(".days")).height < 30, box(part(".days")).right <= box(part(".m")).right + 0.5],
      [[true, true, true], 0, true, true, true, true, true, true]);
    frame.setAttribute("width", "1280");
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
      check("not kept: Draft says so, and does not go on about what browsers clear later", [text($(".lede")).endsWith(NOT_KEPT), text($(".lede")).includes("saves itself"), $(".lapse")], [true, false, null]);
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
    const copyBox = button("Copy list").getBoundingClientRect(), clears = [button("Clear ticked"), button("Clear all")].map((b) => b.getBoundingClientRect());
    check("phone: Copy list is above the list, as wide as the page, with the two clear buttons side by side under it",
      [copyBox.bottom <= $("ul.shop").getBoundingClientRect().top, Math.round(copyBox.width), clears[0].top === clears[1].top && clears[0].top > copyBox.bottom, Math.round(clears[1].right - clears[0].left)],
      [true, 390 - 32, true, 390 - 32]);
    // Where the browser will not copy, the list goes into a box to copy by hand. A long list must not make a
    // box as tall as the list (two phone screens of it, above the real list): 12 lines at most, scrolling inside.
    for (let n = 1; n <= 30; n += 1) { type($("#own-item"), "thing number " + n); $("form.add-own").requestSubmit(); }
    win().navigator.clipboard.writeText = async () => { throw new Error("refused by the test"); };
    button("Copy list").click();
    await settled(() => $(".copybox"));
    const longBox = $(".copybox");
    check("phone: where the browser will not copy, a long list is in a box of 12 lines at most that scrolls inside itself from its first line, with the list still close below",
      [longBox.value.split("\n").length > 30, longBox.rows, styleOf(longBox).fieldSizing, longBox.getBoundingClientRect().height <= 300, longBox.scrollHeight > longBox.clientHeight + 100,
        longBox.scrollTop, [longBox.selectionStart, longBox.selectionEnd === longBox.value.length], $("ul.shop").getBoundingClientRect().top - longBox.getBoundingClientRect().bottom < 200, sideways()],
      [true, 12, "fixed", true, true, 0, [0, true], true, 0]);
    delete win().navigator.clipboard.writeText; // the browser's own again
    const hashes = [["#/", "home"], ["#/browse", "browse"], ["#/saved", "saved"], ["#/shopping", "shopping"], ["#/prep", "prep"], ["#/draft", "draft"], ["#/draft/dlong", "draft"],
      ["#/r/pad-thai-baby", "recipe"], ["#/r/grilled-cheese", "recipe"],
      ["#/r/larp-chicken-and-sticky-rice", "recipe"], ["#/browse?time=days", "browse"], ["#/draft?copy=larp-chicken-and-sticky-rice", "draft"]];
    const wide = [], small = [];
    for (const [hash, page] of hashes) {
      await go(hash, page);
      if (doc().documentElement.scrollWidth > 390) wide.push(hash + " is " + doc().documentElement.scrollWidth + " wide");
      for (const el of $$("button, #nav a, ol.doors a, ul.chapters a, a.row-link, select, textarea, input:not([type=checkbox]), summary, ul.ing label, ul.shop label, label.check, label.switch, .row.minor a")) {
        const box = el.getBoundingClientRect();
        if (box.width && box.height < 43.5) small.push(hash + " " + (text(el) || el.id || el.type).slice(0, 30) + " is " + Math.round(box.height));
      }
    }
    check("phone: no page scrolls sideways, even with a pasted link in a list and a draft", wide, []);
    check("phone: the things to tap are at least 44 px tall", small, []);

    // The tag at 390 px beside the longest things it can sit beside. The real pages are used, with the words of
    // the larp's row, page and plan line made long here (as text), so the site's own styles do the wrapping.
    const longTitle = "Grandmother's Slow Fermented Cabbage with Chili, Garlic and a Great Deal of Patience";
    const box = (el) => el.getBoundingClientRect();
    const inside = (el, within) => box(el).left >= box(within).left - 0.5 && box(el).right <= box(within).right + 0.5;
    // two things on one line side by side, or one under the other: either way neither covers the other
    const apart = (a, b) => box(b).left >= box(a).right - 0.5 || box(b).top >= box(a).bottom - 0.5;
    await go("#/browse", "browse");
    const row = $$("ul.rows li").find((li) => li.querySelector(".days"));
    const shortRow = [Math.round(box(row.querySelector(".days")).top - box(row.querySelector(".time")).top) < 6, inside(row.querySelector(".days"), row.querySelector(".row-link"))];
    row.querySelector(".t").textContent = longTitle;
    row.querySelector(".time").textContent = "SWEETS, about 13 days 23 hours 59 minutes";
    row.querySelector(".days").textContent = "14-day recipe";
    check("phone: in a row the tag sits on the time's line, and with a long title and a long time it goes under the time, whole, with nothing cut off",
      [shortRow, sideways(), inside(row.querySelector(".days"), row.querySelector(".row-link")), inside(row.querySelector(".time"), row.querySelector(".row-link")),
        apart(row.querySelector(".time"), row.querySelector(".days")), box(row.querySelector(".days")).height < 30, box(row.querySelector("button.star")).right <= 390],
      [[true, true], 0, true, true, true, true, true]);
    await go("#/r/larp-chicken-and-sticky-rice", "recipe");
    $(".recipe-title").textContent = longTitle;
    $(".recipe-head .meta span").textContent = "Ready in about 13 days 23 hours 59 minutes.";
    $(".recipe-head .days").textContent = "14-day recipe";
    check("phone: on the recipe page a long title, a long time and the tag wrap inside the page",
      [sideways(), inside($(".recipe-head .days"), $(".recipe-head .meta")), box($(".recipe-head .days")).height < 30, inside($(".recipe-title"), $(".recipe-head"))], [0, true, true, true]);
    check("phone: and a tag that wraps starts at the left edge like any other line: the wider space before it takes no room at the end of the line above",
      [box($(".recipe-head .days")).top >= box($(".recipe-head .meta span")).bottom - 2, Math.abs(box($(".recipe-head .days")).left - box($(".recipe-head .meta")).left) < 0.75], [true, true]);
    await go("#/prep", "prep");
    pick($("#plan-pick"), "larp-chicken-and-sticky-rice");
    button("Add to the plan").click();
    const planLine = $("ul.cooking li[data-id=larp-chicken-and-sticky-rice] .cook-line");
    const asItIs = [inside(planLine.querySelector(".days"), planLine), apart(planLine.querySelector(".t"), planLine.querySelector(".days"))];
    planLine.querySelector(".t").textContent = longTitle;
    planLine.querySelector(".days").textContent = "14-day recipe";
    check("phone: in Prep the tag sits with the recipe's name, beside it or under it, whole, even under a long name, with Remove still in reach",
      [asItIs, sideways(), inside(planLine.querySelector(".days"), planLine), apart(planLine.querySelector(".t"), planLine.querySelector(".days")), box(planLine.querySelector(".days")).height < 30,
        box(planLine.querySelector(".remove")).right <= 390, box(planLine.querySelector(".remove")).height >= 43.5],
      [[true, true], 0, true, true, true, true, true]);
    const nameBox = planLine.querySelector(".cook-name");
    check("phone: a tag that goes under a long name in Prep has room above it and below it, so it does not touch the name or the line under it",
      [box(planLine.querySelector(".days")).top >= box(planLine.querySelector(".t")).bottom - 0.5, box(planLine.querySelector(".days")).top - box(planLine.querySelector(".t")).bottom >= 5.5,
        box(nameBox).bottom - box(planLine.querySelector(".days")).bottom >= 3.5, box(planLine.querySelector(".t")).top - box(nameBox).top >= 3.5],
      [true, true, true, true]);
    const bar = $("#nav").getBoundingClientRect();
    check("phone: the five names are a bar at the bottom", [win().getComputedStyle($("#nav")).position, Math.round(bar.bottom), Math.round(bar.width), $$("#nav a").map(text)],
      ["fixed", 844, 390, ["Draft", "Shopping", "Prep", "Saved", "Browse"]]);
  });
} finally {
  wipe();
  for (const [k, v] of aside) localStorage.setItem(k, v);
}

const passed = lines.filter((x) => x.startsWith("ok")).length;
say("RESULT " + passed + " passed, " + failed + " failed");
document.title = failed ? "FAILED" : "PASSED";
