// Shopping: one running list, grouped by the recipe each thing came from.
// The page reads in the order it is used: what to do with the list first (so Send to Reminders is at the top
// on a phone and early for the keyboard), then the list, then a box to add something, then the one-time help.
import { h, put, crossIcon, statusLine, copyWithFallback, ask } from "../dom.js";
import { shortcutUrl, SHORTCUT_NAME, amountText } from "../lib.js";
import { addOwn, setGot, removeItem, clearTicked, counts, groups, sendLines } from "../shopping-list.js";
import * as state from "../state.js";
import { SITE_TITLE } from "./home.js";

export function shopping(app) {
  document.title = "Shopping | " + SITE_TITLE;
  const summary = h("p", { class: "count quiet small" });
  const body = h("div", {});
  const status = statusLine();
  const askHost = h("div", {});
  const copyHost = h("div", {});
  // Send to Reminders is a link, because it opens a shortcuts:// address. With nothing left to send it has no
  // address, and a press (mouse or keyboard) says why.
  const sent = () => {
    status.textContent = send.hasAttribute("href")
      ? "Sent to Shortcuts. If nothing happened, use Copy list and paste it into Reminders."
      : "Everything is ticked, so there is nothing to send.";
  };
  const send = h("a", { class: "btn primary", onclick: sent, onkeydown: (e) => {
    if (!send.hasAttribute("href") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); sent(); }
  } }, "Send to Reminders");
  const copy = h("button", { type: "button", onclick: () => {
    const lines = sendLines(state.shopping());
    if (!lines.length) { status.textContent = "Nothing to copy. Everything on the list is ticked."; return; }
    copyWithFallback(lines.join("\n"), status, copyHost, "Copied " + lines.length + ". Open Reminders, Shopping List, and paste.");
  } }, "Copy list");
  const clearGot = h("button", { type: "button", onclick: () => {
    const before = state.shopping(), after = clearTicked(before);
    state.setShopping(after);
    draw();
    status.textContent = before.length === after.length ? "Nothing is ticked." : "Took " + (before.length - after.length) + " off the list.";
    if (!after.length) own.focus({ preventScroll: true });
  } }, "Clear ticked");
  const clearAll = h("button", { type: "button", onclick: () => {
    ask(askHost, "Clear the whole list?", "Yes, clear it", "Keep it", () => {
      state.setShopping([]);
      draw();
      status.textContent = "The list is empty.";
      own.focus({ preventScroll: true });
    }, () => clearAll.focus());
  } }, "Clear all");
  const actions = h("div", { class: "stack" }, send, h("div", { class: "split" }, copy, clearGot, clearAll));

  const own = h("input", { type: "text", id: "own-item", autocomplete: "off", enterkeyhint: "done" });
  const ownForm = h("form", { class: "add-own", onsubmit: (e) => {
    e.preventDefault();
    const res = addOwn(state.shopping(), own.value);
    if (!res.added && !res.already) { status.textContent = "Type what to add first."; return; }
    state.setShopping(res.list);
    status.textContent = res.added ? "Added " + own.value.trim() + "." : "That was already on the list. It is back on the to-get side.";
    own.value = "";
    draw();
    own.focus();
  } }, h("label", { class: "field", for: "own-item" }, h("span", {}, "Add something of your own"), own), h("button", { type: "submit" }, "Add"));

  function draw() {
    const list = state.shopping(), c = counts(list);
    summary.textContent = list.length ? c.toGet + " to get" + (c.got ? ", " + c.got + " got" : "") + ". " + state.keptWords("Kept on this device.") : "";
    copyHost.replaceChildren();
    askHost.replaceChildren();
    const lines = sendLines(list);
    // with nothing left to send the button stays where the keyboard can reach it and says why when pressed
    if (lines.length) { send.setAttribute("href", shortcutUrl(lines)); send.removeAttribute("aria-disabled"); send.removeAttribute("tabindex"); }
    else { send.removeAttribute("href"); send.setAttribute("aria-disabled", "true"); send.setAttribute("tabindex", "0"); }
    actions.hidden = !list.length;

    if (!list.length) {
      body.replaceChildren(h("p", { class: "empty" }, "Nothing on the list. Open a recipe and press Add to shopping list, or add something of your own."));
      return;
    }
    body.replaceChildren(...groups(list).map((g) => h("section", { class: "shop-group" },
      h("h2", {}, g.recipeId ? h("a", { href: "#/r/" + g.recipeId }, g.title) : g.title),
      h("ul", { class: "shop" }, g.items.map((x) => h("li", { class: x.got ? "got" : null, "data-key": x.key },
        h("label", {},
          h("input", { type: "checkbox", checked: x.got, onchange: (e) => { state.setShopping(setGot(state.shopping(), x.key, e.target.checked)); redrawKeeping(x.key); } }),
          h("span", { class: "thing" }, h("span", { class: "nm" }, x.name.charAt(0).toUpperCase() + x.name.slice(1)),
            amountText(x) ? [h("span", { class: "leader", "aria-hidden": "true" }), h("span", { class: "amt" }, " " + amountText(x))] : null)),
        h("button", { type: "button", class: "icon-btn remove", "aria-label": "Remove " + x.name, title: "Remove", onclick: () => remove(x) }, crossIcon())))))));
  }

  function remove(x) {
    // the keyboard stays where it was: on the Remove of the thing that moved up into this place, the one before
    // it when this was the last, or the add box when the list is now empty
    const keys = [...body.querySelectorAll("li[data-key]")].map((li) => li.dataset.key);
    const at = keys.indexOf(x.key);
    state.setShopping(removeItem(state.shopping(), x.key));
    draw();
    status.textContent = "Removed " + x.name + ".";
    const left = [...body.querySelectorAll("li[data-key] button.remove")];
    const next = left[Math.min(at, left.length - 1)];
    (next || own).focus({ preventScroll: true });
  }

  function redrawKeeping(key) {
    // after a tick the list is drawn again; put the keyboard back on the box that was ticked
    draw();
    for (const li of body.querySelectorAll("li[data-key]")) if (li.dataset.key === key) li.querySelector("input").focus({ preventScroll: true });
  }

  const help = h("details", { class: "help" },
    h("summary", {}, "Set up Send to Reminders (once, on the iPhone)"),
    h("p", {}, "Send to Reminders hands the list to a Shortcut named " + SHORTCUT_NAME + ", which adds each line to your Shopping List in Reminders. Make it once:"),
    h("ol", {},
      h("li", {}, "Open the Shortcuts app and start a new shortcut. Name it " + SHORTCUT_NAME + "."),
      h("li", {}, "Add the action Split Text. Tap the blue word in it and choose Shortcut Input. Leave it on New Lines."),
      h("li", {}, "Add the action Repeat with Each."),
      h("li", {}, "Inside the repeat, add the action Add New Reminder. Set the reminder to Repeat Item and the list to Shopping List."),
      h("li", {}, "Press Done."),
      h("li", {}, "Come back here and press Send to Reminders. The first time, allow it.")),
    h("p", { class: "quiet small" }, "On a Mac without the Shortcut, Copy list and paste into Reminders does the same job."));

  app.className = "";
  put(app, h("h1", {}, "Shopping"), summary,
    h("div", { class: "cols side" },
      h("div", { class: "right sticky" }, actions, askHost, status, copyHost),
      h("div", { class: "left" }, body, ownForm, help)));
  draw();
}
