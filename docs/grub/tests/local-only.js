// The tests folder is published with the site. A test page that writes to the site's own storage must never
// run where the real site lives, or opening it would wipe the stars, list, plan and drafts kept in that browser.
// tools/run_tests.py serves on 127.0.0.1, so that (and localhost) is the only place such a page may run.
export function localOnly(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}
