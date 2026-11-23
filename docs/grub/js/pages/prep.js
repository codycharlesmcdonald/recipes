// Prep: pick what is being cooked and when the meal is; get the start times and one calendar file.
import { h, put, statusLine, copyWithFallback, download, ask } from "../dom.js";
import { totalText, daysOf, buildPlanIcs, planFileName, chapterList, chapterOf } from "../lib.js";
import { emptyPlan, addToPlan, removeFromPlan, setPlanMinutes, usableMinutes, realTime, planEntries, longestMinutes, planLines, startWhen, mealMsOf, planDay } from "../plan.js";
import { totalMinutes, timeProblem } from "../recipe-format.js";
import { daysMark } from "../recipe-view.js";
import * as state from "../state.js";
import { SITE_TITLE } from "./home.js";

const ALERTS = [["0", "When cooking starts"], ["10", "10 minutes before"], ["30", "30 minutes before"], ["60", "1 hour before"], ["none", "No alert"]];

export function prep(app, data) {
  document.title = "Prep | " + SITE_TITLE;
  // a recipe's time in words; one that carries the tag ("2-day recipe") is counted in hours, never "1 day"
  const said = (r, minutes) => totalText(minutes, daysOf(r));
  const dayName = (ms) => new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(ms);
  const clock = (ms) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(ms);
  const fullDay = (ms) => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(ms);

  let plan = state.plan();
  plan.items = plan.items.filter((x) => data.recipes.some((r) => r.id === x.id));
  if (!realTime(plan.time)) plan.time = state.eatAt();
  if (!ALERTS.some(([v]) => v === plan.alarm)) plan.alarm = "10";

  const save = () => state.setPlan(plan);
  const status = statusLine();
  const copyHost = h("div", {});
  const askHost = h("div", {});
  const cooking = h("div", {});
  const timeline = h("div", { class: "plan-out" });
  const picker = h("select", { id: "plan-pick" });
  // Setting the Day box is what makes the day his. Until then the day is worked out again on every change.
  const date = h("input", { type: "date", id: "plan-day", oninput: () => { plan.date = date.value; plan.dayChosen = Boolean(date.value); save(); drawPlan(); } });
  // While the box is empty or half typed (a time being typed again reads as no time at all) the day is left
  // exactly as it is, and the plan says a time is needed.
  const time = h("input", { type: "time", id: "plan-time", step: "300", value: plan.time, oninput: () => {
    plan.time = time.value; if (realTime(time.value)) state.setEatAt(time.value); settleDay(); save(); drawPlan();
  } });
  const alarm = h("select", { id: "plan-alert", onchange: () => { plan.alarm = alarm.value; save(); } },
    ALERTS.map(([v, label]) => h("option", { value: v, selected: v === plan.alarm }, label)));

  function settleDay() {
    // a day he set stays while that meal is still ahead; otherwise it is the first day everything can start in time.
    // Without a real time there is no meal to judge the day by, so nothing is settled until there is one. The
    // Day box still shows what the plan holds: after Clear plan that is no day at all, and the box is emptied.
    if (!realTime(plan.time)) { date.value = plan.date; return; }
    const d = planDay(plan, Date.now(), longestMinutes(plan, data.recipes));
    plan.date = d.date;
    plan.dayChosen = d.dayChosen;
    date.value = plan.date;
  }

  function entries() {
    const ms = mealMsOf(plan.date, plan.time);
    return ms === null ? null : { ms, list: planEntries(plan, data.recipes, ms) };
  }

  function drawPicker() {
    const left = data.recipes.filter((r) => !plan.items.some((x) => x.id === r.id));
    picker.replaceChildren(h("option", { value: "" }, left.length ? "Pick a recipe" : "Every recipe is in the plan"),
      ...chapterList(data.sections, data.recipes).map((c) => {
        const list = left.filter((r) => chapterOf(r) === c);
        return list.length ? h("optgroup", { label: c }, list.map((r) => h("option", { value: r.id }, r.title))) : null;
      }).filter(Boolean));
  }

  function guessBoxes(r, item) {
    // his own time for a recipe whose total is a guess: hours and minutes, the same two boxes as on Draft
    const total = usableMinutes(item.minutes) ? item.minutes : r.total_minutes;
    const hours = h("input", { type: "number", id: "hours-" + r.id, min: "0", max: "336", step: "any", inputmode: "decimal", value: total >= 60 ? String(Math.floor(total / 60)) : "" });
    const minutes = h("input", { type: "number", id: "mins-" + r.id, min: "0", max: "59", step: "1", inputmode: "numeric", value: total % 60 ? String(total % 60) : "" });
    const note = h("p", { class: "small warn", role: "status" });
    const typed = () => {
      const boxes = { hours: hours.value, minutes: minutes.value };
      const n = totalMinutes(boxes);
      // a box can hold text the browser will not hand over ("--", "1e"): it reads as empty, and is not a number
      const ok = !timeProblem(boxes, hours.validity.badInput || minutes.validity.badInput) && usableMinutes(n);
      plan = setPlanMinutes(plan, r.id, ok ? n : null);
      const words = ok ? "" : "The plan can't use that (plain numbers, two weeks at most). Using the recipe's " + said(r, r.total_minutes) + ".";
      if (note.textContent !== words) note.textContent = words;
      settleDay(); save(); drawPlan();
    };
    hours.addEventListener("input", typed);
    minutes.addEventListener("input", typed);
    return h("div", { class: "guess-line" },
      h("p", { class: "small quiet" }, "The total time for this one is a guess. Change it if you know better. It only changes this plan."),
      h("div", { class: "time-boxes", role: "group", "aria-label": "Time for " + r.title + ", start to finish" },
        h("label", { class: "field inline", for: "hours-" + r.id }, hours, h("span", {}, "hours")),
        h("label", { class: "field inline", for: "mins-" + r.id }, minutes, h("span", {}, "minutes"))),
      note);
  }

  function drawCooking() {
    const rows = plan.items.map((item) => {
      const r = data.recipes.find((x) => x.id === item.id);
      return h("li", { "data-id": r.id },
        h("div", { class: "cook-line" },
          // a recipe that needs more than one day says so on its own line, whatever time this plan counts for it
          h("span", { class: "cook-name" }, h("a", { class: "t", href: "#/r/" + r.id }, r.title), daysMark(r)),
          h("button", { type: "button", class: "linklike remove", "aria-label": "Take " + r.title + " out of the plan", onclick: () => {
            plan = removeFromPlan(plan, r.id); settleDay(); save(); drawPicker(); drawCooking(); drawPlan();
            status.textContent = "Took " + r.title + " out of the plan.";
            picker.focus({ preventScroll: true });
          } }, "Remove")),
        r.total_minutes_estimated === true ? guessBoxes(r, item) : h("p", { class: "small quiet" }, "Takes " + said(r, r.total_minutes) + "."));
    });
    cooking.replaceChildren(rows.length ? h("ul", { class: "cooking" }, rows)
      : h("p", { class: "empty" }, "Nothing picked yet. Pick a recipe below, or press Plan a meal on a recipe."));
  }

  function drawPlan() {
    copyHost.replaceChildren();
    askHost.replaceChildren();
    const e = entries();
    actions.hidden = !e || !e.list.length;
    if (!plan.items.length) { timeline.replaceChildren(h("p", { class: "quiet" }, "The start times show up here once a recipe is picked.")); return; }
    if (!e) { timeline.replaceChildren(h("p", { class: "quiet" }, "Pick a day and a time.")); return; }
    const late = e.list.some((x) => x.startMs < Date.now());
    put(timeline,
      h("p", { class: "plan-day" }, "The meal is " + fullDay(e.ms) + "."),
      h("ol", { class: "timeline" },
        e.list.map((x) => h("li", {},
          h("span", { class: "when" }, startWhen(x, e.ms, dayName, clock, fullDay)),
          h("span", { class: "what" }, "Start ", h("strong", {}, x.title)),
          h("span", { class: "small quiet sub" }, "Takes " + said(data.recipes.find((r) => r.id === x.id), x.minutes) + (x.guess ? (x.changed ? ", your number for this plan." : ", which is a guess.") : ".")))),
        h("li", { class: "eat" }, h("span", { class: "when" }, dayName(e.ms) + " at " + clock(e.ms)), h("span", { class: "what" }, "Eat"))),
      late ? h("p", { class: "warn" }, "A start time in this plan has already passed.") : null);
  }

  function calendarText() {
    const e = entries();
    if (!e || !e.list.length) return null;
    return buildPlanIcs({ events: e.list.map((x) => ({ id: x.id, title: x.title, totalMinutes: x.minutes })), mealMs: e.ms, nowMs: Date.now(),
      alarmMinutes: plan.alarm === "none" ? null : Number(plan.alarm), siteUrl: location.origin + location.pathname });
  }

  const add = h("button", { type: "button", onclick: () => {
    if (!picker.value) { status.textContent = "Pick a recipe from the list first."; return; }
    const r = data.recipes.find((x) => x.id === picker.value);
    plan = addToPlan(plan, r.id); settleDay(); save(); drawPicker(); drawCooking(); drawPlan();
    status.textContent = "Added " + r.title + ".";
  } }, "Add to the plan");

  const toCalendar = h("button", { type: "button", class: "primary", onclick: () => {
    const text = calendarText();
    if (!text) return;
    const e = entries();
    download(planFileName(e.list.map((x) => x.title), plan.date), text, "text/calendar;charset=utf-8");
    status.textContent = "Downloaded the calendar file. Import it into your calendar to add the events. The note below says how.";
  } }, "Add to Calendar");
  const copyPlan = h("button", { type: "button", onclick: () => {
    const e = entries();
    if (!e || !e.list.length) return;
    const text = [fullDay(e.ms)].concat(planLines(e.list, e.ms, dayName, clock, fullDay)).join("\n");
    copyWithFallback(text, status, copyHost, "Copied the plan.");
  } }, "Copy plan");
  const clear = h("button", { type: "button", class: "quiet-btn push", onclick: () => {
    ask(askHost, "Clear the plan?", "Yes, clear it", "Keep it", () => {
      plan = { ...emptyPlan(), time: plan.time, alarm: plan.alarm };
      settleDay(); save(); drawPicker(); drawCooking(); drawPlan();
      status.textContent = "The plan is cleared.";
      picker.focus({ preventScroll: true });
    }, () => clear.focus());
  } }, "Clear plan");
  const actions = h("div", { class: "row" }, toCalendar, copyPlan, clear);

  app.className = "";
  app.replaceChildren(
    h("h1", {}, "Prep"),
    h("p", { class: "lede" }, "Pick what you're cooking and when you eat. Each recipe starts at the meal time minus its total time."),
    h("div", { class: "cols even" },
      h("div", { class: "left no-print" },
        h("h2", {}, "What you're cooking"), cooking,
        h("div", { class: "pick-row" }, h("label", { class: "field", for: "plan-pick" }, h("span", {}, "Add a recipe"), picker), add),
        h("h2", {}, "When you eat"),
        h("div", { class: "when-boxes" },
          h("label", { class: "field", for: "plan-day" }, h("span", {}, "Day"), date),
          h("label", { class: "field", for: "plan-time" }, h("span", {}, "Eat at"), time),
          h("label", { class: "field", for: "plan-alert" }, h("span", {}, "Alert"), alarm))),
      h("div", { class: "right sticky" },
        h("h2", {}, "The plan"), timeline, actions, askHost, status, copyHost,
        // How the file gets into a calendar differs by calendar, and opening it is the wrong first step on most
        // of them, so the note says where importing lives in the two most used, which ones take the file when
        // it is opened, that a calendar may set its own alert, and the way that works everywhere: Copy plan.
        h("div", { class: "plan-note" },
          h("p", { class: "small quiet" }, state.keptWords("The plan is kept on this device until you clear it.")
            + " Add to Calendar downloads one calendar file (.ics) with an event for each recipe."),
          h("p", { class: "small quiet" }, "To add it, import the file into your calendar on a computer: in Google Calendar, Settings, then Import & export; in Outlook, Add calendar, then Upload from file."
            + " Apple Calendar and some phone calendars add the events when you open the file."
            + " Some calendars, Google Calendar among them, may drop the alert picked here and use their own, so check an event after you import it."
            + " If yours will not take the file, Copy plan gives you the same plan as text to paste anywhere.")))));
  settleDay();
  save();
  drawPicker();
  drawCooking();
  drawPlan();
}
