// Start-up and the addresses. Each page is drawn by its own module in pages/; the pure logic is in lib.js,
// recipe-format.js, shopping-list.js and plan.js; what is kept on the device goes through store.js.
import { h, watchSticky } from "./dom.js";
import { haystack, parseRoute } from "./lib.js";
import { home, SITE_TITLE } from "./pages/home.js";
import { browse } from "./pages/browse.js";
import { saved } from "./pages/saved.js";
import { shopping } from "./pages/shopping.js";
import { prep } from "./pages/prep.js";
import { draft } from "./pages/draft.js";
import { recipe } from "./pages/recipe.js";

const app = document.getElementById("app");
const PAGES = { home, browse, saved, shopping, prep, draft, recipe };
let data = null;
let leave = null; // what the page on show wants done when it is left (the recipe page lets go of the screen lock)
let unstick = null;
let first = true;

function plain(heading, line, href, linkText) {
  document.title = SITE_TITLE;
  app.className = "";
  app.replaceChildren(h("h1", {}, heading), h("p", {}, line), h("p", {}, h("a", { href }, linkText)));
}

function route() {
  if (leave) { try { leave(); } catch { /* leaving must never stop the next page */ } leave = null; }
  if (unstick) { unstick(); unstick = null; }
  const r = parseRoute(location.hash);
  const page = PAGES[r.name];
  try {
    if (page) leave = page(app, data, r) || null;
    else plain("Not here", "There is no page at this address.", "#/", "Go to the start");
  } catch (e) {
    // One page failing must not leave the last page on show under a new address, or the site stuck on "Loading".
    console.error(e);
    plain("That didn't work", "This page hit a problem and could not be shown.", "#/", "Go to the start");
  }
  unstick = watchSticky(app);

  const section = r.name === "recipe" ? "browse" : r.name;
  for (const a of document.querySelectorAll("#nav a")) {
    if (a.getAttribute("href") === "#/" + section) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  document.body.dataset.page = r.name;
  app.dataset.page = r.name;
  app.dataset.hash = location.hash;
  window.scrollTo(0, 0);
  if (!first) app.focus({ preventScroll: true }); // a new page starts reading from the top for keyboard and screen reader users
  first = false;
}

async function start() {
  try {
    const res = await fetch("data/recipes.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("status " + res.status);
    data = await res.json();
    for (const r of data.recipes) r._words = haystack(r);
  } catch (e) {
    app.replaceChildren(h("p", {}, "The recipes did not load. Check the connection and reload."));
    return;
  }
  document.getElementById("skip").addEventListener("click", (e) => { e.preventDefault(); app.focus(); });
  window.addEventListener("hashchange", route);
  route();
}

start();
