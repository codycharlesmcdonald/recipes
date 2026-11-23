// Draft: the recipe format as a form, with a live preview drawn by the same code as a real recipe page.
// Drafts save themselves on this device as he types. Nothing here writes to the site.
// Addresses: #/draft (the list of drafts and an empty form), #/draft/<id> (one saved draft),
// #/draft?copy=<recipe id> (a recipe opened as a draft; it is only saved once something in it changes, and
// is taken off the device again if it is changed back to read exactly as the recipe does).
import { h, statusLine, copyWithFallback, download, ask, dayAndTime } from "../dom.js";
import { totalText, isoStamp, chapterList, minDays, MAX_MINUTES, MAX_DAYS } from "../lib.js";
import { CHAPTERS, JOKE, emptyFields, totalMinutes, timeProblem, draftFromRecipe, draftChanged, nothingToKeep, recipeFromDraft, draftProblems,
  recipeFileText, recipeFileName, daysFromField, daysField, daysWords, daysProblem } from "../recipe-format.js";
import { recipeHead, recipeColumns } from "../recipe-view.js";
import * as state from "../state.js";
import { SITE_TITLE } from "./home.js";

const QUICK = [[15, "15 minutes"], [30, "30 minutes"], [45, "45 minutes"], [60, "1 hour"], [90, "1 1/2 hours"], [120, "2 hours"], [180, "3 hours"]];
const OTHER = "__other";
let flash = ""; // one line to show on the list of drafts after a draft was deleted from its own page

function say(el, text) {
  // a status line is only touched when its words change, so a screen reader is not told the same thing on every key
  if (el.textContent !== text) el.textContent = text;
}

function newId() {
  return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function nameOf(d) {
  return d.fields.title.trim() || "Untitled draft";
}

function draftList(whenEmpty) {
  // the saved drafts, with a status line of their own right under them, so a delete is answered where it happened
  const host = h("div", {});
  const status = statusLine();
  function draw(focusAt) {
    const all = state.drafts();
    if (!all.length) { host.replaceChildren(status); if (focusAt !== undefined) whenEmpty(); return; }
    const dels = [];
    host.replaceChildren(h("section", { class: "drafts" },
      h("h2", {}, "Your drafts"),
      h("ul", { class: "rows" }, all.map((d, n) => {
        const askHost = h("div", { class: "ask-host" });
        const title = nameOf(d);
        const del = h("button", { type: "button", class: "linklike remove", "aria-label": "Delete the draft " + title, onclick: () => {
          ask(askHost, "Delete the draft " + title + "?", "Yes, delete it", "Keep it", () => {
            state.deleteDraft(d.id);
            status.textContent = "Deleted the draft " + title + ".";
            draw(n);
          }, () => del.focus());
        } }, "Delete");
        dels.push(del);
        return h("li", { class: "draft-row" },
          h("a", { class: "row-link", href: "#/draft/" + d.id }, h("span", { class: "t" }, title),
            h("span", { class: "m" }, "Last touched " + dayAndTime(d.touched))),
          del, askHost);
      })),
      status));
    // after a delete the keyboard goes to the draft that moved up into its place, or the one before it
    if (focusAt !== undefined) dels[Math.min(focusAt, dels.length - 1)].focus({ preventScroll: true });
  }
  draw();
  if (flash) { status.textContent = flash; flash = ""; }
  return host;
}

export function draft(app, data, route) {
  const plainPage = (line, href, linkText) => {
    document.title = "Draft | " + SITE_TITLE;
    app.className = "";
    app.replaceChildren(h("h1", {}, "Draft"), h("p", {}, line), h("p", {}, h("a", { href }, linkText)));
  };
  // A copy with nothing of his own in it is not worth keeping, but only while the site still has the very
  // recipe it was copied from (same address, same version). If the recipe has gone, or the copy is of a
  // version the site does not have yet, the copy may be the only place its words are, and it stays.
  const siteOf = (x) => (x.origin ? data.recipes.find((r) => r.id === x.origin.id) || null : null);
  const siteVersion = (x) => (siteOf(x) ? siteOf(x).version : 0);
  const sameAsSite = (x) => Boolean(x.origin) && nothingToKeep(x) && siteVersion(x) === x.origin.version;
  // The same copy after the recipe has moved on (the site has a later version). It still holds nothing of his
  // own, only the older words, so when it is opened it is let go and a copy of the recipe as it is now opens.
  const behindSite = (x) => Boolean(x.origin) && nothingToKeep(x) && siteVersion(x) > x.origin.version;
  let d = null, opened = false; // opened: this page is about one draft (saved, or a copy of a recipe), not the list
  if (route.arg) {
    d = state.draft(route.arg);
    if (!d) return plainPage("That draft isn't on this device.", "#/draft", "All drafts");
    if (sameAsSite(d) || behindSite(d)) { // kept by an earlier visit although nothing in it is his own
      state.deleteDraft(d.id);
      d = draftFromRecipe(siteOf(d), null, Date.now());
      history.replaceState(null, "", "#/draft?copy=" + d.origin.id);
    }
    opened = true;
  } else if (route.query.has("copy")) {
    const r = data.recipes.find((x) => x.id === route.query.get("copy"));
    if (!r) return plainPage("That recipe is not here.", "#/browse", "Browse the recipes");
    let mine = state.drafts().find((x) => x.origin && x.origin.id === r.id && !x.separate) || null;
    if (mine && (sameAsSite(mine) || behindSite(mine))) { state.deleteDraft(mine.id); mine = null; }
    d = mine || draftFromRecipe(r, null, Date.now()); // a copy he already changed is carried on with; a new one waits for its first change
    if (mine) { history.replaceState(null, "", "#/draft/" + mine.id); }
    opened = true;
  } else {
    d = { id: null, touched: 0, separate: false, fields: emptyFields() };
  }
  document.title = (opened ? nameOf(d) + " | " : "") + "Draft | " + SITE_TITLE;

  const chapters = chapterList(CHAPTERS, data.recipes).filter((c) => c !== "Other");
  const status = statusLine();
  const copyHost = h("div", {});
  const askHost = h("div", {});
  const preview = h("div", { class: "preview" });
  const takes = h("p", { class: "say", id: "takes", role: "status" });
  const needed = h("p", { class: "needed small" });
  const clash = h("p", { class: "warn small" });
  const fileBox = h("textarea", { class: "copybox", id: "recipe-file", readOnly: true, rows: "12" });
  const fileNote = h("p", { class: "small quiet" });

  const f = d.fields;
  const text = (id, key, extra) => h("input", { type: "text", id, value: f[key], autocomplete: "off", ...extra });
  const area = (id, key, rows, extra) => h("textarea", { id, rows: String(rows), value: f[key], ...extra });
  const title = text("f-title", "title", { "aria-required": "true" });
  const inList = !f.chapter || chapters.includes(f.chapter);
  const chapter = h("select", { id: "f-chapter" },
    h("option", { value: "" }, "No chapter yet"),
    chapters.map((c) => h("option", { value: c, selected: f.chapter === c }, c)),
    h("option", { value: OTHER, selected: !inList }, "Another chapter"));
  const chapterOther = h("input", { type: "text", id: "f-chapter-other", value: inList ? "" : f.chapter, autocomplete: "off" });
  const chapterOtherField = h("label", { class: "field", for: "f-chapter-other", hidden: inList }, h("span", {}, "Chapter name"), chapterOther);
  const hours = h("input", { type: "number", id: "f-hours", min: "0", max: "336", step: "any", inputmode: "decimal", value: f.hours });
  const minutes = h("input", { type: "number", id: "f-minutes", min: "0", max: "59", step: "1", inputmode: "numeric", value: f.minutes });
  const quick = QUICK.map(([n, label]) => h("button", { type: "button", class: "chip", "data-minutes": String(n), onclick: () => {
    hours.value = n >= 60 ? String(Math.floor(n / 60)) : "";
    minutes.value = n % 60 ? String(n % 60) : "";
    settleDays();
    changed();
  } }, label));
  // How many days the recipe needs, first step to eating: the same day, or 2 to 14. It goes into the recipe
  // file as "days" and is the tag a reader sees ("2-day recipe").
  const days = h("select", { id: "f-days", "aria-describedby": "h-days" },
    h("option", { value: "" }, daysWords(1)),
    Array.from({ length: MAX_DAYS - 1 }, (_, n) => n + 2).map((n) => h("option", { value: String(n), selected: daysFromField(f.days) === n }, daysWords(n))));
  const daysNote = h("p", { class: "say", id: "days-note", role: "status" });
  let moved = null; // the last time the control moved by itself, { from, to }, so it can go back when the time stops asking for it
  let daysSaid = ""; // why it moved, in words, until the next thing happens to it

  // A number box can hold text the browser will not hand over ("--", "1e"). The box then reads as empty, so
  // without this the time would count as blank without a word.
  const timeUnread = () => hours.validity.badInput || minutes.validity.badInput;

  function settleDays() {
    // Called when the total time changes (typed, or a one-tap time), never when he picks from the control
    // himself. 24 hours or more cannot be the same day, so the control goes to the fewest days the time allows
    // and says why. If the time then drops again (24 typed where 24 minutes was meant), it goes back.
    // While a time box holds something that is not a number (a slip of the finger: "24e") there is no time to
    // go by, so the control stays where it is until the box is put right.
    if (timeProblem({ hours: hours.value, minutes: minutes.value }, timeUnread())) return;
    const least = minDays(totalMinutes({ hours: hours.value, minutes: minutes.value }));
    const now = daysFromField(days.value);
    const mine = moved && moved.to === days.value; // it is still where it was moved to
    if (least > now) {
      moved = { from: mine ? moved.from : days.value, to: daysField(least) };
      days.value = moved.to;
      daysSaid = "The total time is " + (least - 1) * 24 + " hours or more, so this is set to " + daysWords(least) + ".";
    } else if (mine && least < now) {
      const was = daysFromField(moved.from), back = Math.max(was, least);
      days.value = daysField(back);
      daysSaid = "The total time is under " + (now - 1) * 24 + " hours now, so this is " + (back === was ? "back to " : "set to ") + daysWords(back) + ".";
      moved = back > was ? { from: moved.from, to: days.value } : null;
    } else if (!mine) {
      daysSaid = "";
    }
  }
  hours.addEventListener("input", settleDays);
  minutes.addEventListener("input", settleDays);
  const daysPicked = () => { moved = null; daysSaid = ""; }; // his own pick stands; too few for the time is said, not changed
  days.addEventListener("input", daysPicked);
  days.addEventListener("change", daysPicked);
  const timeText = text("f-time-text", "timeText", { "aria-describedby": "h-time-text" });
  const serves = text("f-serves", "serves", { "aria-describedby": "h-serves" });
  const headnote = area("f-headnote", "headnote", 3);
  const ingredients = area("f-ingredients", "ingredients", 9, { "aria-describedby": "h-ingredients", spellcheck: "true" });
  const steps = area("f-steps", "steps", 10, { "aria-describedby": "h-steps" });
  const tips = area("f-tips", "tips", 3, { "aria-describedby": "h-tips" });
  const credit = text("f-credit", "credit");
  const tags = text("f-tags", "tags", { "aria-describedby": "h-tags", autocapitalize: "off" });
  const separate = h("input", { type: "checkbox", id: "f-separate", checked: d.separate === true });

  function read() {
    f.title = title.value;
    f.chapter = chapter.value === OTHER ? chapterOther.value : chapter.value;
    f.hours = hours.value;
    f.minutes = minutes.value;
    f.days = days.value;
    f.timeText = timeText.value;
    f.serves = serves.value;
    f.headnote = headnote.value;
    f.ingredients = ingredients.value;
    f.steps = steps.value;
    f.tips = tips.value;
    f.credit = credit.value;
    f.tags = tags.value;
    d.separate = separate.checked;
  }

  function timeRefused() {
    // the time boxes hold something no recipe file can be made from, said in plain words; "" when they do not
    if (timeProblem(f, timeUnread())) return timeProblem(f, timeUnread());
    return totalMinutes(f) > MAX_MINUTES ? "The total time can be two weeks at most." : "";
  }

  function timeWords() {
    // what the two time boxes come to, read back in words, with a nudge when the number looks like a slip
    const total = totalMinutes(f);
    if (timeRefused()) return timeRefused();
    if (total <= 0) return "No total time yet. The start time and the calendar file are worked out from it.";
    const fromRecipe = Boolean(d.origin) && total === d.origin.total_minutes;
    const manyHours = Number(String(f.hours).trim().replace(",", ".")) >= 24;
    // with 2 days or more picked the total is said in hours, so "1 day" never sits beside "2 days"
    return "Takes " + totalText(total, daysFromField(f.days)) + ", start to finish."
      + (fromRecipe && d.origin.estimated ? " This number is a guess that came with the recipe. Change it and it counts as yours." : "")
      + (manyHours && !fromRecipe ? " That is a day or more. If you meant minutes, move the number to the minutes box." : "");
  }

  function show() {
    const total = totalMinutes(f);
    say(takes, timeWords());
    // A line that refuses (no recipe file can be made) is in the warning colour, like the list of what is
    // missing at the foot of the form. A line that only tells what happened keeps the plain colour.
    takes.classList.toggle("warn", Boolean(timeRefused()));
    // too few days for the time is said here, beside the control, as well as with the other things that are
    // missing, and the control itself is marked as holding something that will not do
    const tooFew = daysProblem(f);
    say(daysNote, tooFew || daysSaid);
    daysNote.classList.toggle("warn", Boolean(tooFew));
    if (tooFew) days.setAttribute("aria-invalid", "true"); else days.removeAttribute("aria-invalid");
    for (const b of quick) b.setAttribute("aria-pressed", String(Number(b.dataset.minutes) === total));
    chapterOtherField.hidden = chapter.value !== OTHER;

    const recipe = recipeFromDraft(d, isoStamp(Date.now()), siteVersion(d));
    preview.replaceChildren(...recipeHead(recipe, { preview: true }).filter(Boolean), recipeColumns(recipe, { preview: true }));

    const problems = draftProblems(d, { timeUnread: timeUnread() });
    needed.textContent = problems.length ? "No recipe file yet. " + problems.join(" ") : "Nothing is missing. The recipe file is ready.";
    needed.classList.toggle("ok", !problems.length);
    const replaces = data.recipes.find((r) => r.id === recipe.id);
    const own = d.origin && !d.separate;
    clash.textContent = replaces && !own ? "There's already a recipe this one would replace on the site: " + replaces.title + ". Change the title to keep both." : "";
    clash.hidden = !clash.textContent;
    fileBox.value = problems.length ? "" : recipeFileText(recipe);
    fileNote.textContent = problems.length ? "The file shows up here once nothing is missing."
      : "This is " + recipeFileName(recipe) + ", version " + recipe.version + "."
        + (own ? (draftChanged(d)
          ? (siteVersion(d) > d.origin.version
            // the copy was made before the recipe last changed on the site, so its file would undo that change
            ? " It is a changed copy of " + d.origin.title + " as it was at version " + d.origin.version + ". The site has a later version now, version " + siteVersion(d) + ", and this file replaces that one."
            : " It is a changed copy of " + d.origin.title + " and replaces it on the site.")
          : siteVersion(d) > d.origin.version ? " Nothing is changed in this copy, and the site has a later version now, version " + siteVersion(d) + "."
            : " Nothing is changed, so it is the same file the site has now.") : "");
  }

  function setAddress(hash) {
    history.replaceState(null, "", hash);
    app.dataset.hash = location.hash;
  }

  function changed() {
    read();
    // Nothing is kept until there is something to keep: an empty new draft, or a copy of a recipe with nothing
    // changed, is not a draft yet. One that goes back to that (a form emptied again, a copy changed back) is
    // taken off the device again, and the address goes back to the one that makes it afresh.
    if (d.origin ? sameAsSite(d) : nothingToKeep(d)) {
      if (d.id) { state.deleteDraft(d.id); d.id = null; setAddress(d.origin ? "#/draft?copy=" + d.origin.id : "#/draft"); }
      show();
      return;
    }
    d.touched = Date.now();
    if (!d.id) {
      d.id = newId();
      setAddress("#/draft/" + d.id);
    }
    state.saveDraft(d);
    show();
  }

  function finished() {
    // the recipe, or null with the reasons said in the status line
    read();
    const problems = draftProblems(d, { timeUnread: timeUnread() });
    copyHost.replaceChildren();
    if (problems.length) { status.textContent = "No recipe file yet. " + problems.join(" "); return null; }
    return recipeFromDraft(d, isoStamp(Date.now()), siteVersion(d));
  }

  const form = h("div", { class: "form" },
    d.origin ? h("div", { class: "note" },
      h("p", {}, "This is a copy of ", h("a", { href: "#/r/" + d.origin.id }, d.origin.title), ". Added to the site, it replaces " + d.origin.title + ". Tick the box to keep both."),
      h("label", { class: "check", for: "f-separate" }, separate, h("span", {}, "Keep both: make this a separate recipe"))) : null,
    h("label", { class: "field", for: "f-title" }, h("span", {}, "Title"), title),
    h("div", { class: "pair" },
      h("label", { class: "field", for: "f-chapter" }, h("span", {}, "Chapter"), chapter),
      chapterOtherField),
    h("fieldset", { class: "time" },
      h("legend", {}, "Total time, start to finish (every recipe needs one)"),
      h("div", { class: "time-boxes" },
        h("label", { class: "field inline", for: "f-hours" }, hours, h("span", {}, "hours")),
        h("label", { class: "field inline", for: "f-minutes" }, minutes, h("span", {}, "minutes"))),
      h("div", { class: "chips", role: "group", "aria-label": "Common times" }, quick),
      takes),
    h("div", { class: "days-field" },
      h("label", { class: "field", for: "f-days" }, h("span", {}, "Days it needs"), days,
        h("small", { id: "h-days" }, "Pick 2 days for a recipe that starts the day before: an overnight soak, a marinade, a dough that rests until tomorrow.")),
      daysNote),
    h("label", { class: "field", for: "f-time-text" }, h("span", {}, "The time in your own words"), timeText,
      h("small", { id: "h-time-text" }, "If you like. For example: an hour including prep.")),
    h("label", { class: "field", for: "f-serves" }, h("span", {}, "Serves"), serves,
      h("small", { id: "h-serves" }, "As you'd say it: 4 people, 8 thousand people.")),
    h("label", { class: "field", for: "f-headnote" }, h("span", {}, "Headnote"), headnote),
    h("label", { class: "field", for: "f-ingredients" }, h("span", {}, "Ingredients"), ingredients,
      h("small", { id: "h-ingredients" }, "One per line. End a line with a colon to start a group (Sauce:). Start a line with " + JOKE + " for a line that's shown on the page and never goes on a shopping list.")),
    h("label", { class: "field", for: "f-steps" }, h("span", {}, "Steps"), steps,
      h("small", { id: "h-steps" }, "One per line. End a line with a colon to start a group (Preparation:). The numbers start again under each group, so leave your own numbers off.")),
    h("label", { class: "field", for: "f-tips" }, h("span", {}, "Tips"), tips, h("small", { id: "h-tips" }, "One per line.")),
    h("label", { class: "field", for: "f-credit" }, h("span", {}, "Credit"), credit),
    h("label", { class: "field", for: "f-tags" }, h("span", {}, "Tags"), tags, h("small", { id: "h-tags" }, "Words to find it by, with commas between them.")));
  form.addEventListener("input", changed);
  form.addEventListener("change", changed);

  const finish = h("section", { class: "finish" },
    h("h2", {}, "Recipe file"),
    h("p", {}, "Saving straight to the site isn't built yet. Until it is, copy or download the recipe file and send it to whoever looks after the site. It goes in the recipes folder."),
    needed, clash,
    h("div", { class: "row" },
      h("button", { type: "button", class: "primary", onclick: () => {
        const recipe = finished();
        if (recipe) copyWithFallback(recipeFileText(recipe), status, copyHost, "Copied the recipe file, " + recipeFileName(recipe) + ".");
      } }, "Copy recipe file"),
      h("button", { type: "button", onclick: () => {
        const recipe = finished();
        if (!recipe) return;
        download(recipeFileName(recipe), recipeFileText(recipe), "application/json");
        status.textContent = "Downloaded " + recipeFileName(recipe) + ". Look in Downloads.";
      } }, "Download recipe file")),
    status, copyHost,
    h("details", { class: "help" }, h("summary", {}, "See the recipe file"), fileNote,
      h("label", { class: "field", for: "recipe-file" }, h("span", { class: "offscreen" }, "The recipe file"), fileBox)),
    h("div", { class: "row end" },
      h("button", { type: "button", class: "quiet-btn", onclick: (e) => {
        if (!d.id) { status.textContent = "There's nothing to delete yet. Nothing has been kept."; return; }
        ask(askHost, "Delete this draft?", "Yes, delete it", "Keep it", () => {
          flash = "Deleted the draft " + nameOf(d) + ".";
          state.deleteDraft(d.id);
          location.hash = "#/draft";
        }, () => e.target.focus());
      } }, "Delete this draft")),
    askHost);

  // True of some browsers on any kind of device, so it is said to everyone, as a fact, with the one thing that
  // always works. (When nothing is being kept at all, the line above already says so.)
  const lapse = state.keeping()
    ? h("p", { class: "small quiet lapse" }, "Some browsers clear what a site keeps on a device after a week or so without a visit. To keep a draft for good, download its recipe file.")
    : null;

  app.className = "";
  app.replaceChildren(...[
    opened ? h("p", { class: "kicker" }, h("a", { href: "#/draft" }, "All drafts")) : null,
    h("h1", {}, opened ? "Draft" : "Draft a recipe"),
    h("p", { class: "lede" }, "The cookbook's recipe format, as a form. " + state.keptWords("It saves itself on this device as you type.")),
    lapse,
    h("div", { class: "cols even" },
      h("div", { class: "left" }, opened ? null : [draftList(() => title.focus({ preventScroll: true })), h("h2", { class: "new-title" }, "A new recipe")], form, finish),
      h("div", { class: "right sticky" }, h("p", { class: "preview-label quiet small" }, "Preview: how its page will look"), preview)),
  ].filter(Boolean));
  show();
}
