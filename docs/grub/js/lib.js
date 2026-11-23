// Pure helpers: no page, no clock, no storage. Tested in tests/index.html.

export const SITE_TITLE = "Hi, My Name is Food";
export const UID_DOMAIN = "pantsonmyhead.com";
export const MAX_MINUTES = 20160; // two weeks, the most tools/build.py accepts for a total time
export const MAX_DAYS = 14; // the most days a recipe can say it needs; tools/build.py holds the same number
// The Time choices on Browse. A number is "this many minutes or less"; "days" is the recipes that need more than one day.
export const BROWSE_TIMES = [[0, "Any"], [30, "30 minutes or less"], [60, "An hour or less"], ["days", "Two days or more"]];
const DAY_WORDS = ["", "", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen"];

export function daysOf(r) {
  // How many calendar days a recipe needs from its first step to eating. 2 means it starts the day before.
  // 1 is a recipe made the same day, which is every recipe that does not say otherwise in its "days".
  const n = r ? r.days : 0;
  return Number.isInteger(n) && n >= 2 && n <= MAX_DAYS ? n : 1;
}

export function daysLabel(r) {
  // The one place the tag's words are made: "2-day recipe", "3-day recipe". Nothing for a same-day recipe.
  const n = daysOf(r);
  return n > 1 ? n + "-day recipe" : "";
}

export function minDays(totalMinutes) {
  // The fewest days a total time allows. Under 24 hours it can be the same day (an overnight soak that takes
  // 14 hours is the writer's call). From 24 hours on it cannot: 24 hours is 2 days, 48 hours is 3, and so on,
  // stopping at 14 so that the longest total the site takes (two weeks) can still be written down.
  const n = Number(totalMinutes);
  return n >= 1440 ? Math.min(MAX_DAYS, Math.floor(n / 1440) + 1) : 1;
}

export function parseRoute(hash) {
  // "#/", "#/browse?chapter=Grub", "#/saved", "#/shopping", "#/prep", "#/draft", "#/draft?copy=<recipe id>", "#/draft/<id>", "#/r/<id>"
  const [path, search = ""] = String(hash || "").replace(/^#/, "").split("?");
  const query = new URLSearchParams(search);
  let m;
  if (!path.startsWith("/") || path === "/") return { name: "home", arg: null, query }; // "", "#/", and a bare "#app" from the skip link
  if ((m = path.match(/^\/r\/([a-z0-9-]+)$/))) return { name: "recipe", arg: m[1], query };
  if ((m = path.match(/^\/draft\/([a-z0-9]+)$/))) return { name: "draft", arg: m[1], query };
  if ((m = path.match(/^\/(browse|saved|shopping|prep|draft)\/?$/))) return { name: m[1], arg: null, query };
  return { name: "missing", arg: null, query };
}

export function fold(text) {
  // lower case, accents off, punctuation to spaces: "Piña Colada" -> "pina colada"
  return String(text).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[\u2018\u2019']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function slug(title) {
  // the address of a recipe: lower case, accents off, "&" as "and", apostrophes dropped, other runs to one hyphen
  return String(title).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[\u2018\u2019'`]/g, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
}

export function haystack(r) {
  const parts = [r.title, r.section || "", r.source || "", (r.tags || []).join(" ")];
  for (const g of r.ingredients) for (const i of g.items) if (!i.aside) parts.push(i.name);
  // The tag's own words find a recipe that carries it: "2-day", "2 day", "2 days", "two day". They come from
  // the recipe's days and nothing else.
  const days = daysOf(r);
  if (days > 1) parts.push(days + " days " + DAY_WORDS[days]);
  return fold(parts.join(" ")).split(" ").filter(Boolean);
}

const EVERY_RECIPE = "recipes"; // a word every recipe answers to, so it is never asked of one

export function matches(words, query) {
  // Every word typed must start some word of the recipe. The word "recipe" is left out of that: the tag typed
  // whole ("2-day recipe") finds the tagged recipes, and the word alone leaves the list whole. Its first three
  // letters or more are left out the same way, so the list does not empty for a moment while the word is being
  // typed. One or two letters ("r", "re") are searched for like any others.
  const q = fold(query).split(" ").filter((t) => t && !(t.length >= 3 && EVERY_RECIPE.startsWith(t)));
  return q.every((t) => words.some((w) => w.startsWith(t)));
}

export function minutesText(n) {
  n = Math.round(n);
  if (n < 60) return n + (n === 1 ? " minute" : " minutes");
  const d = Math.floor(n / 1440), h = Math.floor((n % 1440) / 60), m = n % 60;
  const out = [];
  if (d) out.push(d + (d === 1 ? " day" : " days"));
  if (h) out.push(h + (h === 1 ? " hour" : " hours"));
  if (m) out.push(m + (m === 1 ? " minute" : " minutes"));
  return out.join(" ");
}

export function totalText(minutes, days = 1) {
  // A total time as the site says it beside a recipe. For a recipe that needs more than one day (days is 2 or
  // more) the total is counted in hours, "24 hours" and never "1 day": the tag beside it counts calendar days
  // ("2-day recipe"), and "1 day" next to that reads as one day against two.
  const n = Math.round(minutes);
  if (!(days > 1) || n < 60) return minutesText(n);
  const h = Math.floor(n / 60), m = n % 60;
  return h + (h === 1 ? " hour" : " hours") + (m ? " " + m + (m === 1 ? " minute" : " minutes") : "");
}

export function countText(n, one, many) {
  return n + " " + (n === 1 ? one : many);
}

export function chapterOf(r) {
  return r.section || "Other";
}

export function chapterList(sections, recipes) {
  // his chapters in his order, then any chapter a recipe uses that is not among them
  const out = [...sections];
  for (const r of recipes) if (!out.includes(chapterOf(r))) out.push(chapterOf(r));
  return out;
}

export function nameKey(name) {
  // what makes two things to buy the same thing. A name with no Latin letters or digits (an emoji, 香菜) folds
  // to nothing, so it is compared as it was typed.
  return fold(name) || String(name).trim().toLowerCase();
}

export function browseState(query, chapters) {
  // the Browse filters as the address has them; anything the address does not name is off
  const time = query.get("time");
  return {
    query: query.get("q") || "",
    chapter: chapters.includes(query.get("chapter")) ? query.get("chapter") : "",
    ...timePicked(BROWSE_TIMES.some(([v]) => v && String(v) === time) ? (time === "days" ? "days" : Number(time)) : 0),
  };
}

export function timePicked(choice) {
  // one Time choice as the two things the list is narrowed by: a number of minutes, or "days"
  return { maxMinutes: typeof choice === "number" ? choice : 0, minDays: choice === "days" ? 2 : 0 };
}

export function timeChoice({ maxMinutes = 0, minDays: least = 0 } = {}) {
  // and back: which of BROWSE_TIMES is on
  return least ? "days" : maxMinutes;
}

export function browseHash({ query = "", chapter = "", maxMinutes = 0, minDays: least = 0 } = {}) {
  // the address that shows this Browse list again, so Back and a reload come back to it
  const q = new URLSearchParams();
  if (chapter) q.set("chapter", chapter);
  if (query.trim()) q.set("q", query);
  if (least) q.set("time", "days"); else if (maxMinutes) q.set("time", String(maxMinutes));
  const text = q.toString();
  return "#/browse" + (text ? "?" + text : "");
}

export function pdfHref(r) {
  // the tablet PDF link, only when it is one of the site's own files in pdf/
  return typeof r.pdf === "string" && /^pdf\/[a-z0-9-]+-v\d+\.pdf$/.test(r.pdf) ? r.pdf : null;
}

export function narrow(recipes, { query = "", chapter = "", maxMinutes = 0, minDays: least = 0 } = {}) {
  // The Browse filters: search words, one chapter, and a time choice. "30 minutes or less" is 30 or less and
  // never a recipe that needs more than one day, however short its own total reads. "Two days or more" is
  // the recipes whose days say so.
  return recipes.filter((r) => matches(r._words || haystack(r), query)
    && (!chapter || chapterOf(r) === chapter)
    && (!maxMinutes || (r.total_minutes <= maxMinutes && daysOf(r) === 1))
    && (!least || daysOf(r) >= least));
}

export function timeFacts(r) {
  // what the recipe page says about time. A guessed total is said to be a guess in plain words.
  const counted = r.total_minutes > 0 ? totalText(r.total_minutes, daysOf(r)) : "";
  if (!counted) return { ready: r.time_text ? "Ready in " + r.time_text : "No total time yet", guess: "" };
  if (!r.total_minutes_estimated) return { ready: "Ready in " + (r.time_text || counted), guess: "" };
  return {
    ready: r.time_text ? "Ready in " + r.time_text : "Ready in about " + counted,
    guess: "The total time is a guess. Plans count it as " + counted + ", and you can change that in Prep.",
  };
}

export function shortTime(r) {
  // the time shown beside a title in a list
  return (r.total_minutes_estimated ? "about " : "") + totalText(r.total_minutes, daysOf(r));
}

export function ingredientText(i) {
  const amount = [i.qty, i.unit].filter(Boolean).join(" ");
  return [amount, i.name].filter(Boolean).join(" ") + (i.note ? ", " + i.note : "");
}

export function amountText(i) {
  // the amount as it reads inside the brackets of a shopping line: "2 handfuls of" -> "2 handfuls"
  return [i.qty, i.unit].filter(Boolean).join(" ").replace(/\s+of$/i, "");
}

function capital(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function mergedLines(items) {
  // one line per thing to buy. The same ingredient from two recipes is shown once with both amounts:
  // "Garlic (2 cloves + 4 cloves)". An item with no amount beside one with an amount adds "some".
  const order = [], byName = new Map();
  for (const i of items) {
    const key = nameKey(i.name);
    if (!byName.has(key)) { byName.set(key, { name: capital(String(i.name).trim()), amounts: [], bare: 0 }); order.push(key); }
    const amount = amountText(i);
    if (amount) byName.get(key).amounts.push(amount); else byName.get(key).bare += 1;
  }
  return order.map((key) => {
    const g = byName.get(key);
    if (!g.amounts.length) return g.name;
    return g.name + " (" + g.amounts.concat(g.bare ? ["some"] : []).join(" + ") + ")";
  });
}

export function shoppingLine(i) {
  // "Garlic (2 cloves)": the thing first, so the list reads well wherever it is pasted
  return mergedLines([i])[0];
}

function stamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function isoStamp(ms) {
  // 2026-11-22T22:40:00Z, the form the recipe files use for created and updated
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function icsEscape(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function foldLine(line) {
  // at most 75 octets of UTF-8 on the first piece, then a space and at most 74 more, never inside a character
  const enc = new TextEncoder(), dec = new TextDecoder();
  const bytes = enc.encode(line);
  if (bytes.length <= 75) return [line];
  const out = [];
  let start = 0, limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    out.push((out.length ? " " : "") + dec.decode(bytes.slice(start, end)));
    start = end;
    limit = 74;
  }
  return out;
}

function eventLines({ id, title, totalMinutes }, { mealMs, nowMs, alarmMinutes, siteUrl }) {
  // one event: cooking starts at the meal time minus the total time and ends at the meal time
  const startMs = mealMs - totalMinutes * 60000;
  const url = siteUrl + "#/r/" + id;
  const lines = [
    "BEGIN:VEVENT",
    "UID:" + id + "-" + stamp(mealMs) + "@" + UID_DOMAIN,
    "DTSTAMP:" + stamp(nowMs),
    "DTSTART:" + stamp(startMs),
    "DTEND:" + stamp(mealMs),
    "SUMMARY:" + icsEscape("Cook: " + title),
    "DESCRIPTION:" + icsEscape(minutesText(totalMinutes) + " start to finish. The meal is at the end of this event.\n" + url),
    "URL:" + url,
  ];
  if (alarmMinutes !== null && alarmMinutes !== undefined) {
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEscape("Start cooking: " + title),
      "TRIGGER:" + (alarmMinutes > 0 ? "-PT" + alarmMinutes + "M" : "PT0M"), "END:VALARM");
  }
  lines.push("END:VEVENT");
  return lines;
}

export function buildPlanIcs({ events, mealMs, nowMs, alarmMinutes, siteUrl }) {
  // one calendar file, one event per recipe, the earliest start first
  const sorted = events.map((e, n) => ({ e, n })).sort((a, b) => b.e.totalMinutes - a.e.totalMinutes || a.n - b.n).map((x) => x.e);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//" + UID_DOMAIN + "//Recipes 1//EN", "CALSCALE:GREGORIAN"];
  for (const e of sorted) lines.push(...eventLines(e, { mealMs, nowMs, alarmMinutes, siteUrl }));
  lines.push("END:VCALENDAR");
  return lines.flatMap(foldLine).join("\r\n") + "\r\n";
}

export function buildIcs({ id, title, totalMinutes, mealMs, nowMs, alarmMinutes, siteUrl }) {
  return buildPlanIcs({ events: [{ id, title, totalMinutes }], mealMs, nowMs, alarmMinutes, siteUrl });
}

export function icsFileName(title) {
  return ("Cook " + title).replace(/[^A-Za-z0-9 -]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) + ".ics";
}

export function planFileName(titles, day) {
  // one recipe keeps its own name; several are "Meal plan 2026-11-29.ics"
  if (titles.length === 1) return icsFileName(titles[0]);
  return ("Meal plan " + day).replace(/[^A-Za-z0-9 -]/g, "").replace(/\s+/g, " ").trim() + ".ics";
}
