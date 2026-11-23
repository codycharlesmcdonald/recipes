# Hi, My Name is Food

A personal recipe site. Plain HTML, CSS and JavaScript, served by GitHub Pages from the `docs` folder, with the recipe site in `docs/grub`.

- `recipes/` holds one JSON file per recipe. These are the source. Every recipe needs `total_minutes`, a whole number above zero: the calendar file is made from it.
- A recipe that cannot be made in one day (an overnight soak, a marinade, a dough that rests until tomorrow) says so with `days`: a whole number from 2 to 14, the calendar days from the first step to eating. `"days": 2` means it starts the day before. Leave it out for a recipe made the same day.
- When `total_minutes` is 1440 (24 hours) or more, `days` is required: at least 2, at least 3 from 2880, and so on. Under 24 hours it is the writer's call.
- The site shows it as a tag beside the time ("2-day recipe"), Browse can list those recipes ("Two days or more"), and typing "2 day" or "two day" in the search finds them.
- Anyone can add a recipe of their own from the Draft page ("Add to your recipes"). It is kept in that browser on that device only, never on the server, and nobody else sees it. The site shows it beside the cookbook's recipes, marked "Yours", and it can be starred, shopped for and planned like any recipe. Its recipe file (Download recipe file) is the copy that lasts: it moves the recipe to another device (Load a recipe file on the Draft page), and put into `recipes/` it joins the cookbook for everyone. The code is in `docs/grub/js/own.js`.
- A store shared by everyone is not built. If one is added, it is a third list handed to `joinData` in `own.js` (called from `route()` in `app.js`) and a second place for `keepMyRecipe` and `deleteMyRecipe` in `state.js` to write to, with the recipe file as what travels between them.
- `tools/build.py` checks every recipe and writes `docs/grub/data/recipes.json`, the one file the site loads. It also names any PDF in `docs/grub/pdf/` that no recipe links to. `tools/test_build.py` tests its checks.
- `tools/make_pdf.py` makes a PDF of a recipe at the reMarkable Paper Pro's page size, with room to write, into `docs/grub/pdf/`, and takes that recipe's earlier PDFs out of the folder.
- `tools/run_tests.py docs/grub` runs the logic tests in `docs/grub/tests/` in headless Chrome, and `tools/run_tests.py docs/grub tests/flows.html` runs the page-by-page checks. It waits for the test page to say it has finished: two minutes at most, or the number of seconds given as a third argument (`tools/run_tests.py docs/grub tests/flows.html 300`). When the time runs out it prints how far the page had got. `tools/test_run_tests.py` tests the tool.
- `tools/shot.py` takes a screenshot of a page at a phone or desktop size.

After changing a recipe: raise its `version` by one, then run `make_pdf.py` on it, then `build.py`. The PDF of the version before is removed by `make_pdf.py`, so the site only ever holds the PDF it links to. A new recipe takes the same two steps, `make_pdf.py` then `build.py`, and the tests name any recipe that has no PDF yet.
