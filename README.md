# Hi, My Name is Food

A personal recipe site. Plain HTML, CSS and JavaScript, served by GitHub Pages from the `docs` folder.

- `recipes/` holds one JSON file per recipe. These are the source. Every recipe needs `total_minutes`, a whole number above zero: the calendar file is made from it.
- `tools/build.py` checks every recipe and writes `docs/data/recipes.json`, the one file the site loads.
- `tools/make_pdf.py` makes a PDF of a recipe at the reMarkable Paper Pro's page size, with room to write, into `docs/pdf/`.
- `tools/run_tests.py docs` runs the logic tests in `docs/tests/` in headless Chrome.
- `tools/shot.py` takes a screenshot of a page at a phone or desktop size.

After changing a recipe: raise its `version` by one, then run `make_pdf.py` on it, then `build.py`.
