// The meal plan as plain data. Pure: the clock and the way a time is written are passed in.
// A plan is { items: [{ id, minutes }], date: "2026-11-29", time: "18:30", alarm: "10", dayChosen: false }.
// minutes on an item is his own number for this plan and is only used where the recipe's total is a guess.
// dayChosen is true once he has set the Day box himself; until then the day is worked out for him.
import { MAX_MINUTES } from "./lib.js";

const WEEK = 7 * 24 * 60 * 60000;

export function emptyPlan() {
  return { items: [], date: "", time: "", alarm: "10", dayChosen: false };
}

export function usableMinutes(n) {
  // a total time a plan can count with: a whole number of minutes, from 1 to two weeks
  return Number.isInteger(n) && n >= 1 && n <= MAX_MINUTES;
}

export function realTime(text) {
  // "18:30" and the like: two digits, a colon, two digits, and a time a clock can show
  const m = /^(\d{2}):(\d{2})$/.exec(typeof text === "string" ? text : "");
  return Boolean(m) && Number(m[1]) < 24 && Number(m[2]) < 60;
}

export function cleanPlan(p) {
  // what was read from the device, with anything that is not what a plan holds put right or left out
  if (!p || typeof p !== "object" || Array.isArray(p)) return emptyPlan();
  const seen = new Set(), items = [];
  for (const x of Array.isArray(p.items) ? p.items : []) {
    if (!x || typeof x.id !== "string" || !x.id || seen.has(x.id)) continue;
    seen.add(x.id);
    items.push({ id: x.id, minutes: usableMinutes(x.minutes) ? x.minutes : null });
  }
  const date = typeof p.date === "string" && mealMsOf(p.date, "12:00") !== null ? p.date : "";
  return { items, date, time: realTime(p.time) ? p.time : "", alarm: typeof p.alarm === "string" ? p.alarm : "10",
    dayChosen: p.dayChosen === true && Boolean(date) };
}

export function addToPlan(plan, id) {
  if (plan.items.some((x) => x.id === id)) return plan;
  return { ...plan, items: [...plan.items, { id, minutes: null }] };
}

export function removeFromPlan(plan, id) {
  return { ...plan, items: plan.items.filter((x) => x.id !== id) };
}

export function setPlanMinutes(plan, id, minutes) {
  const n = usableMinutes(minutes) ? minutes : null;
  return { ...plan, items: plan.items.map((x) => (x.id === id ? { ...x, minutes: n } : x)) };
}

export function planEntries(plan, recipes, mealMs) {
  // one entry per recipe still on the site, each starting at the meal time minus its total time, earliest first
  const out = [];
  plan.items.forEach((item, n) => {
    const r = recipes.find((x) => x.id === item.id);
    if (!r || out.some((x) => x.id === r.id)) return;
    const guess = r.total_minutes_estimated === true;
    const own = guess && usableMinutes(item.minutes) ? item.minutes : null;
    const minutes = own || r.total_minutes;
    out.push({ id: r.id, title: r.title, minutes, guess, changed: Boolean(own) && own !== r.total_minutes,
      startMs: mealMs - minutes * 60000, order: n });
  });
  return out.sort((a, b) => a.startMs - b.startMs || a.order - b.order);
}

export function longestMinutes(plan, recipes) {
  return Math.max(0, ...planEntries(plan, recipes, 0).map((e) => e.minutes));
}

export function startWhen(entry, mealMs, dayName, clock, longDay) {
  // "Saturday at 6:30 PM". A start a week or more before the meal names the date, because the weekday
  // alone would read as the meal's own week.
  const far = longDay && mealMs - entry.startMs >= WEEK;
  return (far ? longDay : dayName)(entry.startMs) + " at " + clock(entry.startMs);
}

export function planLines(entries, mealMs, dayName, clock, longDay) {
  // "Start Larp Chicken & Sticky Rice Saturday at 6:30 PM", and so on, ending "Eat at 6:30 PM"
  return entries.map((e) => "Start " + e.title + " " + startWhen(e, mealMs, dayName, clock, longDay))
    .concat("Eat at " + clock(mealMs));
}

export function mealMsOf(date, time) {
  // a day and a time on this device's clock as a moment; null when either is missing or not a real date
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ""), t = /^(\d{2}):(\d{2})/.exec(time || "");
  if (!d || !t) return null;
  if (Number(t[1]) > 23 || Number(t[2]) > 59) return null;
  const when = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  // month 13 or day 45 would roll over into some other real day; that is not the day that was written
  if (Number.isNaN(when.getTime()) || when.getMonth() !== Number(d[2]) - 1 || when.getDate() !== Number(d[3])) return null;
  return when.getTime();
}

export function dateValue(ms) {
  const d = new Date(ms), two = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
}

export function defaultDay(nowMs, time, longest) {
  // today at the usual meal time, or the first later day on which the longest recipe can still start in time
  const now = new Date(nowMs);
  const t = /^(\d{2}):(\d{2})/.exec(time || "") || [0, "18", "30"];
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(t[1]), Number(t[2]));
  for (let n = 0; n < 15 && first.getTime() - longest * 60000 < nowMs; n += 1) first.setDate(first.getDate() + 1);
  return dateValue(first.getTime());
}

export function planDay(plan, nowMs, longest) {
  // The day the plan is for. A day he set himself is kept for as long as that meal is still ahead. Otherwise
  // it is the first day on which everything in the plan can still start in time, worked out again each time
  // the plan changes, so a long recipe added later does not start in the past.
  // While the time is not a real time (the box is empty, or half typed) there is no meal to judge his day by,
  // so a real day he set is kept as it is.
  if (plan.dayChosen && !realTime(plan.time) && mealMsOf(plan.date, "12:00") !== null) return { date: plan.date, dayChosen: true };
  const meal = mealMsOf(plan.date, plan.time);
  if (plan.dayChosen && meal !== null && meal >= nowMs) return { date: plan.date, dayChosen: true };
  return { date: defaultDay(nowMs, plan.time, longest), dayChosen: false };
}
