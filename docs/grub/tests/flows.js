// The page checks write to the site's own storage (stars, list, plan, drafts), and this folder is published
// with the site. So the checks themselves live in flows-run.js and are only loaded on this computer, through
// tools/run_tests.py. Opened anywhere else, this page touches nothing and says why.
import { localOnly } from "./local-only.js";

if (localOnly(location.hostname)) {
  await import("./flows-run.js");
} else {
  document.getElementById("out").textContent = "Not run. These checks write to the site's storage, so they only run through tools/run_tests.py on the computer the site is built on. Nothing was touched.";
  document.title = "NOT RUN";
}
