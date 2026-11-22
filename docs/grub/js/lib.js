// Pure helpers: no page, no clock, no storage. Tested in tests/index.html.

export const SHORTCUT_NAME = "Recipe Shopping";
export const UID_DOMAIN = "pantsonmyhead.com";

export function fold(text) {
  // lower case, accents off, punctuation to spaces: "Piña Colada" -> "pina colada"
  return String(text).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[\u2018\u2019']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
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

export function ingredientText(i) {
  const amount = [i.qty, i.unit].filter(Boolean).join(" ");
  return [amount, i.name].filter(Boolean).join(" ") + (i.note ? ", " + i.note : "");
}

export function shoppingLine(i) {
  // "Garlic (2 cloves)": the thing first, so the list reads well in Reminders
  const name = i.name.charAt(0).toUpperCase() + i.name.slice(1);
  const amount = [i.qty, i.unit].filter(Boolean).join(" ");
  return amount ? name + " (" + amount + ")" : name;
}

export function shortcutUrl(lines, name = SHORTCUT_NAME) {
  return "shortcuts://run-shortcut?name=" + encodeURIComponent(name) + "&input=text&text=" + encodeURIComponent(lines.join("\n"));
}

function stamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
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

export function buildIcs({ id, title, totalMinutes, mealMs, nowMs, alarmMinutes, siteUrl }) {
  // one event: cooking starts at the meal time minus the total time and ends at the meal time
  const startMs = mealMs - totalMinutes * 60000;
  const url = siteUrl + "#/r/" + id;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//" + UID_DOMAIN + "//Recipes 1//EN",
    "CALSCALE:GREGORIAN",
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
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.flatMap(foldLine).join("\r\n") + "\r\n";
}

export function icsFileName(title) {
  return ("Cook " + title).replace(/[^A-Za-z0-9 -]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) + ".ics";
}
