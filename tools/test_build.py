"""Checks for tools/build.py: the rules a recipe file must keep, above all the rules for days (the tag on a
recipe that cannot be made in one day). Also that the tablet PDF words the tag the way the site does, that
tools/make_pdf.py takes a recipe's earlier PDFs out of the folder, that the build names a PDF no recipe links
to, and that the PDFs that are there are the size of the tablet's screen.

    python3 -I -B tools/test_build.py

Recipes are handed to the checker as plain data, and the whole builds and the PDF folders here are throwaway
folders, so nothing is written into recipes/ or docs/. The real recipes and PDFs are only read. Standard
library only.
"""
import contextlib
import glob
import importlib.util
import io
import json
import os
import re
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def load(name):
    """A tool from this folder as a module, by its path (python3 -I does not look in the folder by itself)."""
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


build = load("build")
make_pdf = load("make_pdf")

DAYS_SHAPE = "days must be a whole number from 2 to 14 (leave it out for a recipe made the same day)"


def site_lib():
    """The words of docs/grub/js/lib.js, where the site keeps the same numbers and the tag's words."""
    with open(os.path.join(ROOT, "docs", "grub", "js", "lib.js"), encoding="utf-8") as fh:
        return fh.read()


def recipe(**changes):
    """A recipe that passes every check, with some fields changed. A value of None takes the field out."""
    r = {"schema": 1, "id": "test-beans", "version": 1, "title": "Test Beans", "total_minutes": 600,
         "ingredients": [{"section": "", "items": [{"qty": "1", "unit": "lb", "name": "beans", "note": ""}]}],
         "steps": [{"section": "", "items": ["Cook the beans."]}]}
    for key, value in changes.items():
        if value is None:
            r.pop(key, None)
        else:
            r[key] = value
    return r


def problems(**changes):
    return build.check(recipe(**changes), "test-beans")


class DaysRules(unittest.TestCase):
    def test_a_good_recipe_has_nothing_wrong(self):
        self.assertEqual(problems(), [])

    def test_days_is_optional_under_a_day(self):
        self.assertEqual(problems(total_minutes=600), [])
        self.assertEqual(problems(total_minutes=1439), [])

    def test_under_a_day_days_is_the_writers_call(self):
        # a 10-hour overnight soak is a 2-day recipe if its writer says so
        self.assertEqual(problems(total_minutes=600, days=2), [])
        self.assertEqual(problems(total_minutes=20, days=3), [])
        self.assertEqual(problems(total_minutes=600, days=14), [])

    def test_days_1_is_refused(self):
        self.assertEqual(problems(days=1), [DAYS_SHAPE])

    def test_days_15_is_refused(self):
        self.assertEqual(problems(days=15), [DAYS_SHAPE])

    def test_days_two_and_a_half_is_refused(self):
        self.assertEqual(problems(days=2.5), [DAYS_SHAPE])

    def test_days_as_text_is_refused(self):
        self.assertEqual(problems(days="2"), [DAYS_SHAPE])

    def test_other_things_that_are_not_a_number_of_days(self):
        for bad in (0, -2, 2.0, True, False, [2], {"n": 2}, ""):
            self.assertEqual(problems(days=bad), [DAYS_SHAPE], repr(bad))
        with_null = recipe()
        with_null["days"] = None          # "days": null in the file
        self.assertEqual(build.check(with_null, "test-beans"), [DAYS_SHAPE])

    def test_a_total_of_a_day_with_no_days_is_refused(self):
        self.assertEqual(problems(total_minutes=1440),
                         ["total_minutes is 1440, which is 24 hours or more, so the recipe cannot be made in one day: add days, at least 2"])

    def test_a_total_of_a_day_with_days_2_or_more_passes(self):
        self.assertEqual(problems(total_minutes=1440, days=2), [])
        self.assertEqual(problems(total_minutes=1440, days=5), [])
        self.assertEqual(problems(total_minutes=2879, days=2), [])

    def test_a_total_of_two_days_with_days_2_is_refused(self):
        self.assertEqual(problems(total_minutes=2880, days=2),
                         ["days is 2, but total_minutes is 2880, which needs days of at least 3"])
        self.assertEqual(problems(total_minutes=2880, days=3), [])
        self.assertEqual(problems(total_minutes=2880),
                         ["total_minutes is 2880, which is 24 hours or more, so the recipe cannot be made in one day: add days, at least 3"])

    def test_the_longest_total_can_still_be_written(self):
        # two weeks is the most a total can be, and 14 is the most days can be, so the least stops at 14
        self.assertEqual(problems(total_minutes=20160, days=14), [])
        self.assertEqual(problems(total_minutes=20160, days=13),
                         ["days is 13, but total_minutes is 20160, which needs days of at least 14"])

    def test_the_fewest_days_a_total_allows(self):
        self.assertEqual([build.min_days(n) for n in (1, 600, 1439, 1440, 2879, 2880, 4320, 18719, 18720, 20160)],
                         [1, 1, 1, 2, 2, 3, 4, 13, 14, 14])

    def test_a_wrong_total_is_said_once_without_a_days_line_on_top(self):
        for bad in (0, -5, "60", 20161):
            said = problems(total_minutes=bad, days=2)
            self.assertEqual(len(said), 1, repr(bad))
            self.assertIn("total_minutes must be a whole number above zero", said[0])

    def test_wrong_days_on_a_day_long_recipe_is_one_plain_line(self):
        self.assertEqual(problems(total_minutes=1440, days=1), [DAYS_SHAPE])

    def test_the_same_numbers_as_the_site(self):
        lib = site_lib()
        self.assertEqual(int(re.search(r"export const MAX_DAYS = (\d+);", lib).group(1)), build.MAX_DAYS)
        self.assertEqual(int(re.search(r"export const MAX_MINUTES = (\d+);", lib).group(1)), build.MAX_MINUTES)


class TheRealRecipes(unittest.TestCase):
    # Nothing here counts the recipes or says which of them carry days: a recipe added, or one more tagged,
    # must not fail a test. The larp is the recipe the tag was made for, so that one is looked at by name.
    def test_every_recipe_file_passes_and_the_larp_says_its_days(self):
        files = sorted(glob.glob(os.path.join(ROOT, "recipes", "*.json")))
        self.assertTrue(files, "no recipe files were found")
        days = {}
        for path in files:
            name = os.path.basename(path)[:-5]
            with open(path, encoding="utf-8") as fh:
                r = json.load(fh)
            self.assertEqual(build.check(r, name), [], name)
            if "days" in r:
                days[name] = r["days"]
        self.assertGreaterEqual(days.get("larp-chicken-and-sticky-rice", 0), 2)
        for name, n in days.items():
            self.assertEqual(make_pdf.days_label({"days": n}), "%d-day recipe" % n, name)


class OwnRecipeAddresses(unittest.TestCase):
    """A visitor's own recipes live at "my--" and a plain id on their device (docs/grub/js/own.js). That never
    meets a cookbook address because the build refuses "--" in an id, so these hold the two to the same rule."""

    def test_an_address_of_ones_own_is_never_a_cookbook_id(self):
        self.assertIn("id is not a slug", build.check(recipe(id="my--beans"), "my--beans"))

    def test_the_file_a_visitor_downloads_is_a_cookbook_id(self):
        # Download recipe file gives the plain part back, which the build takes as it is
        self.assertEqual(build.check(recipe(id="beans"), "beans"), [])

    def test_the_site_holds_the_same_id_rule(self):
        with open(os.path.join(ROOT, "docs", "grub", "js", "own.js"), encoding="utf-8") as fh:
            own = fh.read()
        self.assertIn('const ID = /' + build.ID_RE.pattern.replace("(-", "(?:-") + '/;', own)
        self.assertEqual(int(re.search(r"export const MAX_ID = (\d+);", own).group(1)), 60)
        self.assertIn('export const OWN_MARK = "my--";', own)


class WholeBuild(unittest.TestCase):
    """The build run from start to finish on a throwaway folder shaped like the project."""

    def run_build(self, recipes, pdfs=()):
        with tempfile.TemporaryDirectory(prefix="recipe-build-test-") as root:
            os.makedirs(os.path.join(root, "recipes"))
            for r in recipes:
                with open(os.path.join(root, "recipes", r["id"] + ".json"), "w", encoding="utf-8") as fh:
                    json.dump(r, fh)
            if pdfs:
                os.makedirs(os.path.join(root, "docs", "grub", "pdf"))
            for name in pdfs:       # stand-ins: the build only looks at which files are there
                with open(os.path.join(root, "docs", "grub", "pdf", name), "wb") as fh:
                    fh.write(b"%PDF-1.4\n")
            said, stopped = io.StringIO(), None
            with contextlib.redirect_stdout(said):
                try:
                    build.main(root)
                except SystemExit as e:
                    stopped = str(e)
            out = os.path.join(root, "docs", "grub", "data", "recipes.json")
            data = None
            if os.path.exists(out):
                with open(out, encoding="utf-8") as fh:
                    data = json.load(fh)
            return said.getvalue(), stopped, data

    def test_the_built_data_carries_days(self):
        said, stopped, data = self.run_build([recipe(id="soaked-beans", title="Soaked Beans", total_minutes=840, days=2),
                                              recipe(id="quick-beans", title="Quick Beans", total_minutes=20)])
        self.assertIsNone(stopped, said)
        by_id = {r["id"]: r for r in data["recipes"]}
        self.assertEqual(by_id["soaked-beans"]["days"], 2)
        self.assertNotIn("days", by_id["quick-beans"])

    def test_a_recipe_with_too_few_days_stops_the_build_and_the_message_names_the_file(self):
        said, stopped, data = self.run_build([recipe(id="two-day-beans", title="Two Day Beans", total_minutes=2880, days=2),
                                              recipe(id="quick-beans", title="Quick Beans", total_minutes=20)])
        self.assertEqual(said.strip(), "recipes/two-day-beans.json: days is 2, but total_minutes is 2880, which needs days of at least 3")
        self.assertEqual(stopped, "1 recipe file(s) failed; nothing written")
        self.assertIsNone(data)

    def test_a_day_long_recipe_with_no_days_stops_the_build(self):
        said, stopped, data = self.run_build([recipe(id="long-beans", title="Long Beans", total_minutes=1440)])
        self.assertEqual(said.strip(), "recipes/long-beans.json: total_minutes is 1440, which is 24 hours or more, "
                                       "so the recipe cannot be made in one day: add days, at least 2")
        self.assertTrue(stopped)
        self.assertIsNone(data)

    def test_a_pdf_no_recipe_links_to_is_named_by_the_build(self):
        # version 2 of the beans has its PDF; version 1's file was left behind, and so was one of a recipe that is gone
        beans = recipe(id="soaked-beans", title="Soaked Beans", version=2)
        said, stopped, data = self.run_build([beans], pdfs=["soaked-beans-v2.pdf", "soaked-beans-v1.pdf", "old-stew-v3.pdf"])
        self.assertIsNone(stopped, said)
        self.assertEqual(data["recipes"][0]["pdf"], "pdf/soaked-beans-v2.pdf")
        note = [line for line in said.splitlines() if line.startswith("Note:")]
        self.assertEqual(len(note), 1, said)
        self.assertIn("these 2 PDFs in docs/grub: pdf/old-stew-v3.pdf, pdf/soaked-beans-v1.pdf. They are still published", note[0])
        self.assertNotIn("soaked-beans-v2.pdf", note[0])
        said, _stopped, _data = self.run_build([beans], pdfs=["soaked-beans-v2.pdf", "soaked-beans-v1.pdf"])
        self.assertIn("Note: no recipe links to this PDF in docs/grub: pdf/soaked-beans-v1.pdf. It is still published", said)

    def test_no_note_when_every_pdf_is_linked(self):
        beans = recipe(id="soaked-beans", title="Soaked Beans", version=2)
        said, stopped, _data = self.run_build([beans], pdfs=["soaked-beans-v2.pdf"])
        self.assertIsNone(stopped, said)
        self.assertNotIn("Note:", said)
        said, stopped, _data = self.run_build([beans])          # no pdf folder at all
        self.assertIsNone(stopped, said)
        self.assertNotIn("Note:", said)

    def test_the_real_pdf_folder_holds_only_pdfs_a_recipe_links_to(self):
        recipes = []
        for path in sorted(glob.glob(os.path.join(ROOT, "recipes", "*.json"))):
            with open(path, encoding="utf-8") as fh:
                r = json.load(fh)
            r["pdf"] = "pdf/%s-v%s.pdf" % (r["id"], r["version"])
            recipes.append(r)
        self.assertEqual(build.unlinked_pdfs(ROOT, recipes), [])


class EarlierPdfs(unittest.TestCase):
    """make_pdf.py takes a recipe's earlier PDFs out of the folder once the new one is there."""

    def folder(self, names):
        tmp = tempfile.TemporaryDirectory(prefix="recipe-pdf-test-")
        self.addCleanup(tmp.cleanup)
        for name in names:
            with open(os.path.join(tmp.name, name), "wb") as fh:
                fh.write(b"%PDF-1.4\n")
        return tmp.name

    def test_earlier_versions_go_and_everything_else_stays(self):
        names = ["beans-v1.pdf", "beans-v2.pdf", "beans-v3.pdf", "beans-v4.pdf", "beans-v10.pdf",
                 "beans-and-rice-v1.pdf", "beans-v2-v1.pdf", "green-beans-v1.pdf", "beans-v1.html", "beans-vx.pdf", "beans.pdf"]
        folder = self.folder(names)
        gone = make_pdf.remove_earlier_pdfs(folder, "beans", 3)
        self.assertEqual([os.path.basename(p) for p in gone], ["beans-v1.pdf", "beans-v2.pdf"])
        self.assertEqual(sorted(os.listdir(folder)), sorted(n for n in names if n not in ("beans-v1.pdf", "beans-v2.pdf")))

    def test_nothing_goes_while_the_new_pdf_is_not_there(self):
        folder = self.folder(["beans-v1.pdf", "beans-v2.pdf"])
        self.assertEqual(make_pdf.remove_earlier_pdfs(folder, "beans", 3), [])
        self.assertEqual(sorted(os.listdir(folder)), ["beans-v1.pdf", "beans-v2.pdf"])

    def test_a_first_version_has_nothing_earlier(self):
        folder = self.folder(["beans-v1.pdf"])
        self.assertEqual(make_pdf.remove_earlier_pdfs(folder, "beans", 1), [])
        self.assertEqual(os.listdir(folder), ["beans-v1.pdf"])

    def test_an_id_with_marks_in_it_is_matched_as_plain_text(self):
        folder = self.folder(["a.b-v1.pdf", "axb-v1.pdf", "a.b-v2.pdf"])
        self.assertEqual([os.path.basename(p) for p in make_pdf.earlier_pdfs(folder, "a.b", 2)], ["a.b-v1.pdf"])

    def test_a_folder_that_is_not_there(self):
        self.assertEqual(make_pdf.earlier_pdfs(os.path.join(self.folder([]), "nowhere"), "beans", 3), [])


class TabletPdfPage(unittest.TestCase):
    def test_the_pdfs_that_are_there_are_within_a_pixel_of_the_tablet_screen(self):
        # make_pdf.py asks for 509.3 x 679.1 pt and Chrome writes a little under that; the tablet's screen is
        # 1620 x 2160 px at 229 px to the inch. Read from the files themselves, the first page's size.
        measured = 0
        for path in sorted(glob.glob(os.path.join(ROOT, "docs", "grub", "pdf", "*.pdf"))):
            with open(path, "rb") as fh:
                box = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]", fh.read())
            if not box:
                continue        # written in a way this plain reading cannot see; the others stand for it
            measured += 1
            wide, tall = (float(n) * 229 / 72 for n in box.groups())
            self.assertLess(abs(wide - 1620), 1, path)
            self.assertLess(abs(tall - 2160), 1, path)
            self.assertLessEqual(float(box.group(1)), make_pdf.PAGE_W, path)
            self.assertLessEqual(float(box.group(2)), make_pdf.PAGE_H, path)
        self.assertGreater(measured, 0, "no PDF's page size could be read")


class TabletPdfWords(unittest.TestCase):
    def test_the_label(self):
        self.assertEqual([make_pdf.days_label({"days": n}) for n in (2, 3, 14)], ["2-day recipe", "3-day recipe", "14-day recipe"])
        self.assertEqual([make_pdf.days_label(r) for r in ({}, {"days": 1}, {"days": 15}, {"days": 2.5}, {"days": "2"}, {"days": True})], [""] * 6)

    def test_the_site_makes_the_same_words(self):
        self.assertIn('n + "-day recipe"', site_lib())

    def test_the_tag_is_in_the_line_that_carries_the_time(self):
        made_up = recipe(time_text="a day", total_minutes=1440, days=2, **{"yield": "8 people"})
        self.assertIn('<p class="meta">Ready in a day. 2-day recipe. Serves 8 people.</p>', make_pdf.build_html(made_up))
        # with no words of the writer's for the time, the time is counted in hours, never as "1 day" beside the tag
        self.assertIn('<p class="meta">Ready in 24 hours. 2-day recipe.</p>', make_pdf.build_html(recipe(total_minutes=1440, days=2)))

    def test_the_real_larp_says_it_right_after_the_time(self):
        # its own words for the time are not pinned here, only that the tag is the sentence after them
        with open(os.path.join(ROOT, "recipes", "larp-chicken-and-sticky-rice.json"), encoding="utf-8") as fh:
            larp = json.load(fh)
        label = make_pdf.days_label(larp)
        self.assertTrue(label)
        self.assertRegex(make_pdf.build_html(larp), r'<p class="meta">Ready in [^<.]*\. %s\.' % re.escape(label))

    def test_a_same_day_recipe_has_no_tag(self):
        page = make_pdf.build_html(recipe(time_text="10 hours"))
        self.assertIn('<p class="meta">Ready in 10 hours.</p>', page)
        self.assertNotIn("day recipe", page)


if __name__ == "__main__":
    unittest.main(verbosity=1)
