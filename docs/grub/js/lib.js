// Pure helpers: no page, no clock, no storage. Tested in tests/index.html.

export const SITE_TITLE = "Hi, My Name is Food";
export const SHORTCUT_NAME = "Recipe Shopping";
export const UID_DOMAIN = "pantsonmyhead.com";
export const MAX_MINUTES = 20160; // two weeks, the most tools/build.py accepts for a total time
export const BROWSE_TIMES = [[0, "Any"], [30, "30 minutes or less"], [60, "An hour or less"]];

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
  return fold(parts.join(" ")).split(" ").filter(Boolean);
}

export function matches(words, query) {
  // every word typed must start some word of the recipe
  const q = fold(query).split(" ").filter(Boolean);
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
    maxMinutes: BROWSE_TIMES.some(([n]) => n && String(n) === time) ? Number(time) : 0,
  };
}

export function browseHash({ query = "", chapter = "", maxMinutes = 0 } = {}) {
  // the address that shows this Browse list again, so Back and a reload come back to it
  const q = new URLSearchParams();
  if (chapter) q.set("chapter", chapter);
  if (query.trim()) q.set("q", query);
  if (maxMinutes) q.set("time", String(maxMinutes));
  const text = q.toString();
  return "#/browse" + (text ? "?" + text : "");
}

export function isIosDevice({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
  // an iPhone or iPad. An iPad says it is a Mac, and is told apart by its touch screen.
  return /iPhone|iPad|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

export function storageCanLapse(nav = {}) {
  // Safari, and every browser on an iPhone or iPad, can clear what a site has kept after a week without a visit
  const ua = nav.userAgent || "";
  return isIosDevice(nav) || (/Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua));
}

export function pdfHref(r) {
  // the tablet PDF link, only when it is one of the site's own files in pdf/
  return typeof r.pdf === "string" && /^pdf\/[a-z0-9-]+-v\d+\.pdf$/.test(r.pdf) ? r.pdf : null;
}

export function narrow(recipes, { query = "", chapter = "", maxMinutes = 0 } = {}) {
  // the Browse filters: search words, one chapter, and a time limit ("under 30 minutes" is 30 or less)
  return recipes.filter((r) => matches(r._words || haystack(r), query)
    && (!chapter || chapterOf(r) === chapter)
    && (!maxMinutes || r.total_minutes <= maxMinutes));
}

export function timeFacts(r) {
  // what the recipe page says about time. A guessed total is said to be a guess in plain words.
  const counted = r.total_minutes > 0 ? minutesText(r.total_minutes) : "";
  if (!counted) return { ready: r.time_text ? "Ready in " + r.time_text : "No total time yet", guess: "" };
  if (!r.total_minutes_estimated) return { ready: "Ready in " + (r.time_text || counted), guess: "" };
  return {
    ready: r.time_text ? "Ready in " + r.time_text : "Ready in about " + counted,
    guess: "The total time is a guess. Plans count it as " + counted + ", and you can change that in Prep.",
  };
}

export function shortTime(r) {
  // the time shown beside a title in a list
  return (r.total_minutes_estimated ? "about " : "") + minutesText(r.total_minutes);
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
  // "Garlic (2 cloves)": the thing first, so the list reads well in Reminders
  return mergedLines([i])[0];
}

export function shortcutUrl(lines, name = SHORTCUT_NAME) {
  return "shortcuts://run-shortcut?name=" + encodeURIComponent(name) + "&input=text&text=" + encodeURIComponent(lines.join("\n"));
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
