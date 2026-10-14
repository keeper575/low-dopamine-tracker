# Slow Week

A small weekly tracker for healthy, low-dopamine activities, such as reading a Kindle for 2 hours a week, reading 50 pages, or walking 10 km.

- Add a weekly goal with a target and a unit (hours, minutes, pages, times, km).
- Log progress through the week and watch the bar fill.
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

## Deploy (GitHub Pages)

1. Push this repo to GitHub.
2. Go to **Settings → Pages**, set the source to **Deploy from a branch**, then choose `main` and `/ (root)`.
3. The site is published at `https://<username>.github.io/low-dopamine-tracker/`.

Any static host works the same way (Netlify, Cloudflare Pages, Vercel): point it at the repo root with no build command.

## Note on data

Data stays in the browser you use. Use **Export data** to back it up or to move it to another device.
