"""Checks for tools/run_tests.py, the tool that opens a test page in headless Chrome and waits for it.

    python3 -I -B tools/test_run_tests.py

The first tests hand plain data to the parts of the tool that decide what is printed. The last ones run the
whole tool on small made-up test pages in a throwaway folder: one that passes, one that stops on an error, and
one that never finishes, which must still say how far it got. Those open headless Chrome the way the tool
always does, and the one that never finishes takes as long as the wait it is given. Standard library only.
"""
import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, "run_tests.py")

spec = importlib.util.spec_from_file_location("run_tests", TOOL)
run_tests = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run_tests)

PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>running</title></head>
<body><pre id="out"></pre><script>
var out = document.getElementById("out");
function say(line) { out.textContent += (out.textContent ? "\\n" : "") + line; }
%s
</script></body></html>
"""
PASSES = 'say("ok first"); say("ok second"); say("RESULT 2 passed, 0 failed"); document.title = "PASSED";'
FAILS = 'say("ok first"); say("FAIL second"); say("RESULT 1 passed, 1 failed"); document.title = "FAILED";'
THROWS = 'say("ok first"); setTimeout(function () { throw new Error("boom in the page"); }, 50);'
HANGS = 'say("ok first"); setTimeout(function () { say("ok second"); }, 300);  // and then nothing: it never finishes'


class TheWatcherTag(unittest.TestCase):
    def test_its_address_is_relative_to_the_page(self):
        self.assertEqual(run_tests.watcher_tag("index.html"), '<script src="__watch.js"></script>')
        self.assertEqual(run_tests.watcher_tag("tests/index.html"), '<script src="../__watch.js"></script>')
        self.assertEqual(run_tests.watcher_tag("a/b/page.html"), '<script src="../../__watch.js"></script>')

    def test_it_goes_in_ahead_of_the_pages_own_scripts(self):
        page = "<!doctype html><html><HEAD><script src='mine.js'></script></head><body></body></html>"
        served = run_tests.with_watcher(page, "tests/index.html")
        self.assertLess(served.index("__watch.js"), served.index("mine.js"))
        self.assertEqual(served.replace(run_tests.watcher_tag("tests/index.html"), ""), page)
        self.assertTrue(run_tests.with_watcher("<p>no head</p>", "index.html").startswith('<script src="__watch.js">'))

    def test_nothing_the_tool_puts_in_a_page_starts_at_the_servers_root(self):
        self.assertNotIn('src="/', run_tests.with_watcher("<head></head>", "tests/index.html"))
        self.assertNotIn('"/__', run_tests.WATCH_JS)
        self.assertNotIn("'/__", run_tests.WATCH_JS)


class WhatIsPrinted(unittest.TestCase):
    def test_a_page_that_passed(self):
        lines, code = run_tests.outcome({"kind": "finished", "title": "PASSED", "out": "ok a\nRESULT 1 passed, 0 failed"}, None, 120, "")
        self.assertEqual((lines, code), (["ok a\nRESULT 1 passed, 0 failed", "title: PASSED"], 0))

    def test_a_page_that_failed(self):
        lines, code = run_tests.outcome({"kind": "finished", "title": "FAILED", "out": "FAIL a"}, {"out": "earlier"}, 120, "")
        self.assertEqual((lines, code), (["FAIL a", "title: FAILED"], 1))

    def test_a_page_that_stopped_on_an_error(self):
        lines, code = run_tests.outcome({"kind": "threw", "title": "running", "out": "ok a", "note": "boom (x.js:3)"}, None, 120, "")
        self.assertEqual(code, 1)
        self.assertEqual(lines, ["ok a", "The page stopped on an error that nothing caught: boom (x.js:3)", "title: running"])

    def test_a_passed_title_from_a_page_that_threw_is_still_a_failure(self):
        self.assertEqual(run_tests.outcome({"kind": "threw", "title": "PASSED", "out": "", "note": "late"}, None, 120, "")[1], 1)

    def test_a_page_that_never_finished_says_how_far_it_got(self):
        lines, code = run_tests.outcome(None, {"kind": "progress", "out": "ok a\nok b"}, 7, "chrome words")
        self.assertEqual(code, 1)
        self.assertEqual(lines[0], "ok a\nok b")
        self.assertIn("how far the page had got", lines[1])
        self.assertIn("did not say it had finished within 7 seconds", lines[2])
        self.assertIn("chrome words", lines[2])
        self.assertEqual(lines[3], "title: None")

    def test_a_page_that_never_wrote_anything(self):
        lines, code = run_tests.outcome(None, None, 7, "")
        self.assertEqual(code, 1)
        self.assertEqual(len(lines), 2)
        self.assertIn("did not say it had finished within 7 seconds", lines[0])
        self.assertEqual(run_tests.outcome(None, {"kind": "progress", "out": None}, 7, "")[0], lines)


class TheWholeTool(unittest.TestCase):
    """The tool run from start to finish on a made-up test page."""

    def run_page(self, script, wait):
        with tempfile.TemporaryDirectory(prefix="recipe-runner-test-") as site:
            os.makedirs(os.path.join(site, "tests"))
            with open(os.path.join(site, "tests", "index.html"), "w", encoding="utf-8") as fh:
                fh.write(PAGE % script)
            p = subprocess.run([sys.executable, "-I", "-B", TOOL, site, "tests/index.html", str(wait)],
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=wait + 60)
        return p.returncode, p.stdout.decode("utf-8", "replace")

    def test_a_page_that_passes(self):
        code, said = self.run_page(PASSES, 60)
        self.assertEqual(code, 0, said)
        self.assertEqual(said.splitlines(), ["ok first", "ok second", "RESULT 2 passed, 0 failed", "title: PASSED"])

    def test_a_page_that_fails(self):
        code, said = self.run_page(FAILS, 60)
        self.assertEqual(code, 1, said)
        self.assertEqual(said.splitlines()[-2:], ["RESULT 1 passed, 1 failed", "title: FAILED"])

    def test_a_page_that_stops_on_an_error_is_not_waited_for_and_shows_what_it_had_written(self):
        code, said = self.run_page(THROWS, 60)
        self.assertEqual(code, 1, said)
        self.assertEqual(said.splitlines()[0], "ok first")
        self.assertIn("The page stopped on an error that nothing caught: ", said)
        self.assertIn("boom in the page", said)

    def test_a_page_that_never_finishes_prints_how_far_it_got_before_the_time_ran_out(self):
        code, said = self.run_page(HANGS, 10)
        self.assertEqual(code, 1, said)
        lines = said.splitlines()
        self.assertEqual(lines[:2], ["ok first", "ok second"], said)
        self.assertIn("how far the page had got", lines[2])
        self.assertIn("did not say it had finished within 10 seconds", lines[3])
        self.assertEqual(lines[-1], "title: None")


if __name__ == "__main__":
    unittest.main(verbosity=1)
