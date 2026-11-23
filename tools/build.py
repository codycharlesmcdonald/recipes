"""Check every recipe in recipes/ and write the one data file the site loads, docs/grub/data/recipes.json.

    python3 -I -B tools/build.py

A recipe that breaks a rule stops the build with the file and the reason. total_minutes is required on every
recipe: a whole number above zero. days is there only on a recipe that cannot be made in one day: a whole
number from 2 to 14, the calendar days from the first step to eating (2 means it starts the day before). A
total of 24 hours or more must say its days. The checks are tested by tools/test_build.py. Standard library only.
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
SECTION_ORDER = ["Brekky", "Basics", "Grub", "Drank", "SWEETS"]
MAX_MINUTES = 20160  # two weeks
MAX_DAYS = 14        # js/lib.js holds the same number


def whole(n):
    """True for a whole number (and not for true or false, which Python also counts as numbers)."""
    return isinstance(n, int) and not isinstance(n, bool)


def min_days(total_minutes):
    """The fewest days a total time allows: 1 under 24 hours, then 24 hours is 2 days, 48 hours is 3, and so on,
    stopping at 14 so the longest total (two weeks) can still be written down. The same rule as minDays in js/lib.js."""
    return min(MAX_DAYS, total_minutes // 1440 + 1) if total_minutes >= 1440 else 1


def check_days(r):
    """What is wrong with a recipe's days, as a list of plain sentences. An empty list means nothing is."""
    days, tm = r.get("days"), r.get("total_minutes")
    if "days" in r and not (whole(days) and 2 <= days <= MAX_DAYS):
        return ["days must be a whole number from 2 to %d (leave it out for a recipe made the same day)" % MAX_DAYS]
    if not (whole(tm) and 0 < tm <= MAX_MINUTES):
        return []       # the total time is wrong, and that is said on its own
    least = min_days(tm)
    if least > 1 and "days" not in r:
        return ["total_minutes is %d, which is 24 hours or more, so the recipe cannot be made in one day: add days, at least %d" % (tm, least)]
    if "days" in r and days < least:
        return ["days is %d, but total_minutes is %d, which needs days of at least %d" % (days, tm, least)]
    return []


def check(r, name):
    errs = []

    def need(cond, msg):
        if not cond:
            errs.append(msg)

    need(isinstance(r, dict), "not an object")
    if errs:
        return errs
    need(isinstance(r.get("id"), str) and ID_RE.match(r.get("id", "")) and len(r["id"]) <= 60, "id is not a slug")
    need(r.get("id") == name, "id differs from the file name")
    need(isinstance(r.get("version"), int) and not isinstance(r.get("version"), bool) and r.get("version", 0) >= 1, "version must be a whole number, 1 or more")
    need(isinstance(r.get("title"), str) and r.get("title", "").strip(), "title is missing")
    tm = r.get("total_minutes")
    need(isinstance(tm, int) and not isinstance(tm, bool) and 0 < tm <= 20160, "total_minutes must be a whole number above zero (it drives the calendar file)")
    am = r.get("active_minutes")
    need(am is None or (isinstance(am, int) and not isinstance(am, bool) and isinstance(tm, int) and 0 < am <= tm), "active_minutes must be a whole number from 1 up to total_minutes")
    errs.extend(check_days(r))
    ing = r.get("ingredients")
    need(isinstance(ing, list) and ing, "ingredients is missing")
    for g in ing if isinstance(ing, list) else []:
        need(isinstance(g, dict) and isinstance(g.get("items"), list) and g["items"], "an ingredient group has no items")
        for i in g.get("items", []) if isinstance(g, dict) else []:
            need(isinstance(i, dict) and isinstance(i.get("name"), str) and i["name"].strip(), "an ingredient has no name")
    steps = r.get("steps")
    need(isinstance(steps, list) and steps, "steps is missing")
    for g in steps if isinstance(steps, list) else []:
        need(isinstance(g, dict) and isinstance(g.get("items"), list) and g["items"] and all(isinstance(x, str) and x.strip() for x in g["items"]),
             "a step group is empty or holds an empty step")
    return errs


def unlinked_pdfs(root, recipes):
    """The PDFs in <root>/docs/grub/pdf that no recipe links to: an earlier version's file, or one whose recipe
    is gone. They go out with the site all the same, so the build names them."""
    folder = os.path.join(root, "docs", "grub", "pdf")
    linked = {r["pdf"] for r in recipes if r.get("pdf")}
    names = os.listdir(folder) if os.path.isdir(folder) else []
    return sorted("pdf/" + n for n in names if n.lower().endswith(".pdf") and "pdf/" + n not in linked)


def main(root=ROOT):
    """Check the recipes in <root>/recipes and write <root>/docs/grub/data/recipes.json. root is this project,
    except in tools/test_build.py, which builds a throwaway folder."""
    recipes, bad = [], 0
    for path in sorted(glob.glob(os.path.join(root, "recipes", "*.json"))):
        name = os.path.basename(path)[:-5]
        shown = "recipes/%s.json" % name       # every message names the file it is about
        try:
            with open(path, encoding="utf-8") as fh:
                r = json.load(fh)
        except (ValueError, UnicodeDecodeError) as e:
            print("%s: not valid JSON: %s" % (shown, e))
            bad += 1
            continue
        errs = check(r, name)
        for e in errs:
            print("%s: %s" % (shown, e))
        bad += bool(errs)
        if not errs:
            pdf = "pdf/%s-v%s.pdf" % (r["id"], r["version"])
            if os.path.exists(os.path.join(root, "docs", "grub", pdf)):
                r["pdf"] = pdf
            recipes.append(r)
    if bad:
        sys.exit("%d recipe file(s) failed; nothing written" % bad)
    recipes.sort(key=lambda r: (SECTION_ORDER.index(r.get("section")) if r.get("section") in SECTION_ORDER else len(SECTION_ORDER),
                                r["title"].lower()))
    out = os.path.join(root, "docs", "grub", "data", "recipes.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump({"sections": SECTION_ORDER, "recipes": recipes}, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")
    print("%d recipes -> %s (%d with a PDF)" % (len(recipes), out, sum(1 for r in recipes if r.get("pdf"))))
    spare = unlinked_pdfs(root, recipes)
    if spare:
        one = len(spare) == 1
        print("Note: no recipe links to %s in docs/grub: %s. %s still published with the site. tools/make_pdf.py "
              "takes out a recipe's earlier PDFs when it makes the new one; a file left over can be deleted."
              % ("this PDF" if one else "these %d PDFs" % len(spare), ", ".join(spare), "It is" if one else "They are"))


if __name__ == "__main__":
    main()
