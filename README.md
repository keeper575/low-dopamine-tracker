# Slow Week

A small weekly tracker for healthy, low-dopamine activities, such as reading a Kindle for 2 hours a week, reading 50 pages, or walking 10 km.

- Add a weekly goal with a number and any unit you like: 2 hours, 50 pages, 5 sudokus.
- Log progress through the week: **Add** puts an amount on top of the week's total, **Set total** replaces it (use 0 to clear the week).
- Edit a goal to change its name, target or unit. The new target applies to every week, past weeks included.
- Add one-off tasks to a week's checklist and tick them off.
- Nothing unfinished gets lost. An unticked task moves on to the next week (marked "from Oct 5") until you tick it. If you fall short on a goal, the missing amount is added to next week's target, and keeps rolling forward until you catch up. For example, 30 of 50 pages means next week's target is 70.
- Move between weeks to see past ones. Each week starts on Monday.
- Export and import your data as JSON.

## Stack

Plain HTML, CSS and JavaScript. There are no dependencies and no build step. Data is saved in the browser's `localStorage`.

```
index.html   page markup
style.css    styles, including light and dark mode
app.js       state, rendering and events
```

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Try it safely (demo mode)

Add `?demo` to the URL, or click **Try demo** at the bottom of the page. Demo mode loads sample goals and tasks into separate storage, so your real data is never touched. Use **Reset demo** to start over, or **Exit demo** to go back.

## Deploy (GitHub Pages)

When you change `style.css` or `app.js`, bump the `?v=` number on their links in `index.html`. Browsers cache these files for a few minutes, and the new number makes them fetch the update instead of mixing an old file with a new page.

1. Push this repo to GitHub.
2. Go to **Settings → Pages**, set the source to **Deploy from a branch**, then choose `main` and `/ (root)`.
3. The site is published at `https://<username>.github.io/low-dopamine-tracker/`.

Any static host works the same way (Netlify, Cloudflare Pages, Vercel): point it at the repo root with no build command.

## Note on data

Data stays in the browser you use. Use **Export data** to back it up or to move it to another device.
