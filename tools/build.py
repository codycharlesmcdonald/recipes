"""Check every recipe in recipes/ and write the one data file the site loads, docs/grub/data/recipes.json.

    python3 -I -B tools/build.py

A recipe that breaks a rule stops the build with the file and the reason. total_minutes is required on every
recipe: a whole number above zero. Standard library only.
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
SECTION_ORDER = ["Brekky", "Basics", "Grub", "Drank", "SWEETS"]


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


def main():
    recipes, bad = [], 0
    for path in sorted(glob.glob(os.path.join(ROOT, "recipes", "*.json"))):
        name = os.path.basename(path)[:-5]
        try:
            r = json.load(open(path, encoding="utf-8"))
        except (ValueError, UnicodeDecodeError) as e:
            print("%s: not valid JSON: %s" % (name, e))
            bad += 1
            continue
        errs = check(r, name)
        for e in errs:
            print("%s: %s" % (name, e))
        bad += bool(errs)
        if not errs:
            pdf = "pdf/%s-v%s.pdf" % (r["id"], r["version"])
            if os.path.exists(os.path.join(ROOT, "docs", "grub", pdf)):
                r["pdf"] = pdf
            recipes.append(r)
    if bad:
        sys.exit("%d recipe file(s) failed; nothing written" % bad)
    recipes.sort(key=lambda r: (SECTION_ORDER.index(r.get("section")) if r.get("section") in SECTION_ORDER else len(SECTION_ORDER),
                                r["title"].lower()))
    out = os.path.join(ROOT, "docs", "grub", "data", "recipes.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump({"sections": SECTION_ORDER, "recipes": recipes}, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")
    print("%d recipes -> %s (%d with a PDF)" % (len(recipes), out, sum(1 for r in recipes if r.get("pdf"))))


if __name__ == "__main__":
    main()
