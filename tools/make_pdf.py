"""Make a PDF of one recipe, sized for the reMarkable Paper Pro screen, with room to write on.

    python3 -I tools/make_pdf.py recipes/<file>.json [--out folder]

The PDF goes to docs/grub/pdf/<id>-v<version>.pdf, where the site links to it.

The page is 509.3 x 679.1 pt (1620 x 2160 px at 229 ppi), so the tablet shows it at full size with no
scaling. Every page carries the recipe's id, version and page number as plain text in the footer, which
is how a marked-up copy is matched back to its recipe when it returns. The right-hand column and the
block on the last page are left empty for handwriting.

It writes the HTML next to the PDF and prints the PDF with the Chrome that is already on this Mac, run
headless with its own throwaway profile folder, so the everyday Chrome and its profile are not touched.
Standard library only.
"""
import argparse
import html
import json
import os
import re
import subprocess
import sys
import tempfile

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PAGE_W, PAGE_H = 509.3, 679.1          # points: the Paper Pro's portrait screen at 1:1

CSS = """
@page {
  size: %(w)spt %(h)spt;
  margin: 30pt 28pt 38pt 30pt;
  @bottom-left  { content: "%(footer)s"; font: 8pt Charter, Georgia, serif; color: #000; }
  @bottom-right { content: "page " counter(page) " of " counter(pages); font: 8pt Charter, Georgia, serif; color: #000; }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font: 11.5pt/1.5 Charter, Georgia, serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.main { margin-right: 158pt; }
.notescol { position: fixed; top: 0; right: 0; bottom: 0; width: 144pt; border-left: 0.6pt solid #8a8a8a; padding-left: 8pt; }
.notescol span { font-size: 9pt; font-style: italic; }
h1 { font: 700 22pt/1.15 "Iowan Old Style", Charter, Georgia, serif; margin: 0 0 6pt; }
.meta { font-size: 10pt; margin: 0 0 8pt; }
.headnote { font-style: italic; margin: 0 0 12pt; }
h2 { font: 700 13pt/1.2 "Iowan Old Style", Charter, Georgia, serif; margin: 14pt 0 4pt; break-after: avoid; }
h3 { font: 700 10.5pt/1.2 Charter, Georgia, serif; margin: 8pt 0 0; break-after: avoid; }
ul.ing { list-style: none; margin: 0; padding: 0; }
ul.ing li { line-height: 22.5pt; break-inside: avoid; padding-left: 15pt; text-indent: -15pt; }
ul.ing li::before { content: ""; display: inline-block; width: 8pt; height: 8pt; border: 0.7pt solid #000; margin-right: 7pt; vertical-align: -0.5pt; }
ul.ing .q { font-weight: 700; }
ul.ing li.aside { font-style: italic; }
ul.ing li.aside::before { border-color: transparent; }
ol.steps { counter-reset: none; }
ol.steps { margin: 0; padding-left: 18pt; }
ol.steps li { margin: 0 0 9pt; line-height: 1.6; break-inside: avoid; padding-left: 2pt; }
ol.steps li::marker { font-weight: 700; }
ul.notes { margin: 0; padding-left: 14pt; }
ul.notes li { margin: 0 0 4pt; }
/* Page breaks: a section stays whole. If it does not fit in what is left of a page it starts the next one,
   so the steps are not split two on one page and four on the next. A section taller than a page still
   breaks, but only between lines or steps. */
section.keep, .group { break-inside: avoid; }
.changes { break-inside: avoid; margin-top: 16pt; }
.changes .line { height: 25pt; border-bottom: 0.6pt solid #8a8a8a; }
.sample { font-size: 9pt; border: 0.7pt solid #000; display: inline-block; padding: 1pt 6pt; margin: 0 0 8pt; }
"""


def esc(text):
    return html.escape(str(text), quote=True)


def minutes_text(n):
    n = int(n)
    if n < 60:
        return "%d minutes" % n
    h, m = divmod(n, 60)
    out = "%d hour%s" % (h, "" if h == 1 else "s")
    return out + (" %d minutes" % m if m else "")


def step_groups(steps):
    """Steps come as a plain list of strings or as groups of {section, items}; return groups either way."""
    if steps and isinstance(steps[0], str):
        return [{"section": "", "items": steps}]
    return steps


def ingredient_line(item):
    if item.get("aside"):
        return '<li class="aside">%s</li>' % esc(item["name"])
    qty = " ".join(p for p in (item.get("qty", ""), item.get("unit", "")) if p)
    out = ""
    if qty:
        out += '<span class="q">%s</span> ' % esc(qty)
    out += esc(item["name"])
    if item.get("note"):
        out += ", " + esc(item["note"])
    return "<li>%s</li>" % out


CHANGES_TITLE = "Changes for next time"
LAYOUTS = ("end", "after-ingredients", "none")     # where the ruled "Changes for next time" block goes


def build_html(r, changes="end"):
    footer = "%s, version %s" % (r["id"], r["version"])
    if any(c in footer for c in '"\\\n'):
        sys.exit("the recipe id cannot hold a quote, a backslash or a line break")
    parts = ["<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>%s</title><style>%s</style></head><body>"
             % (esc(r["title"]), CSS % {"w": PAGE_W, "h": PAGE_H, "footer": footer})]
    parts.append('<div class="notescol"><span>Notes</span></div>')
    parts.append('<div class="main">')
    if r.get("sample"):
        parts.append('<div class="sample">Sample recipe, for testing only</div>')
    parts.append("<h1>%s</h1>" % esc(r["title"]))
    meta = []
    t = r.get("time") or {}
    if r.get("time_text"):
        meta.append("Ready in %s" % r["time_text"])
    elif r.get("total_minutes"):
        meta.append("Ready in %s" % minutes_text(r["total_minutes"]))
    elif t.get("total"):
        meta.append("%s total" % t["total"])
    if r.get("yield"):
        meta.append(r["yield"] if r["yield"].lower().startswith(("serves", "makes")) else "Serves %s" % r["yield"])
    if r.get("source"):
        meta.append("Credit: %s" % r["source"].rstrip("."))
    meta = [m for m in meta if m]
    if meta:
        parts.append('<p class="meta">%s</p>' % esc(". ".join(meta) + "."))
    if r.get("headnote"):
        parts.append('<p class="headnote">%s</p>' % esc(r["headnote"]))
    changes_block = '<div class="changes"><h2>%s</h2>%s</div>' % (CHANGES_TITLE, '<div class="line"></div>' * 6)
    parts.append('<section class="keep"><h2>Ingredients</h2>')
    for group in r["ingredients"]:
        parts.append('<div class="group">')
        if group.get("section"):
            parts.append("<h3>%s</h3>" % esc(group["section"]))
        parts.append('<ul class="ing">%s</ul></div>' % "".join(ingredient_line(i) for i in group["items"]))
    parts.append("</section>")
    if changes == "after-ingredients":
        parts.append(changes_block)
    groups = step_groups(r["steps"])
    for n, group in enumerate(groups):
        title = group.get("section") or ("Steps" if len(groups) == 1 else "")
        parts.append('<section class="keep">')
        if title:
            parts.append("<h2>%s</h2>" % esc(title))
        parts.append('<ol class="steps">%s</ol></section>' % "".join("<li>%s</li>" % esc(s) for s in group["items"]))
    if r.get("notes"):
        parts.append('<section class="keep"><h2>Tips</h2>')
        parts.append('<ul class="notes">%s</ul></section>' % "".join("<li>%s</li>" % esc(n) for n in r["notes"]))
    if changes == "end":
        parts.append(changes_block)
    parts.append("</div></body></html>")
    return "".join(parts)


def print_pdf(html_path, pdf_path):
    with tempfile.TemporaryDirectory(prefix="recipe-pdf-chrome-") as profile:
        cmd = [CHROME, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
               "--user-data-dir=" + profile, "--no-pdf-header-footer", "--print-to-pdf=" + pdf_path,
               "file://" + html_path]
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90)
    if p.returncode != 0 or not os.path.exists(pdf_path):
        sys.exit("Chrome did not make the PDF (exit %s): %s" % (p.returncode, p.stderr.decode("utf-8", "replace")[-400:]))


def page_facts(pdf_path, footer):
    """(page count, True when the last page holds nothing but the ruled changes block). None when pypdf is missing."""
    try:
        from pypdf import PdfReader
    except ImportError:
        return None
    reader = PdfReader(pdf_path)
    # the text comes out in no fixed order (the footer can run into the line beside it), so take out what is on
    # every page (the footer, the page number, the notes column's label) and see whether only the title is left
    last = reader.pages[-1].extract_text() or ""
    last = re.sub(r"page \d+ of \d+", " ", last.replace(footer, " "))
    words = [w for w in last.split() if w != "Notes"]
    return len(reader.pages), words == CHANGES_TITLE.split()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("recipe")
    ap.add_argument("--out", default=None, help="folder for the PDF (default: pdf/ beside recipes/)")
    args = ap.parse_args()
    src = os.path.abspath(args.recipe)
    r = json.load(open(src, encoding="utf-8"))
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.abspath(args.out) if args.out else os.path.join(root, "docs", "grub", "pdf")
    work_dir = os.path.join(root, "pdf-work")          # the HTML each PDF is printed from; not published
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(work_dir, exist_ok=True)
    stem = "%s-v%s" % (r["id"], r["version"])
    html_path = os.path.join(work_dir, stem + ".html")
    pdf_path = os.path.join(out_dir, stem + ".pdf")
    footer = "%s, version %s" % (r["id"], r["version"])
    # The ruled changes block goes at the end. If that leaves it alone on a page of its own, try it under the
    # ingredients (where a kept-whole steps section often leaves room), and failing that leave it out: every
    # page has the notes column anyway.
    chosen = None
    for layout in LAYOUTS:
        with open(html_path, "w", encoding="utf-8") as fh:
            fh.write(build_html(r, layout))
        print_pdf(html_path, pdf_path)
        facts = page_facts(pdf_path, footer)
        if facts is None or layout == "none":
            chosen = (layout, facts)
            break
        pages, alone = facts
        if layout == "end":
            end_pages = pages
            if not alone:
                chosen = (layout, facts)
                break
        elif layout == "after-ingredients" and not alone and pages < end_pages:
            chosen = (layout, facts)
            break
    print("%s  (changes block: %s%s)" % (pdf_path, chosen[0], ", %d pages" % chosen[1][0] if chosen[1] else ""))


if __name__ == "__main__":
    main()
