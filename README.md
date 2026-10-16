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
index.html            page markup
style.css             styles, including light and dark mode
app.js                state, rendering and events
sw.js                 service worker for offline use
manifest.webmanifest  install details (name, icons, colours)
icons/                app icons
android/              Android helper app (Kotlin), built by .github/workflows/android-helper.yml
```

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Install on your phone (works offline)

1. Open https://keeper575.github.io/low-dopamine-tracker/ on your phone.
   - **iPhone:** use Safari, tap the Share button, then **Add to Home Screen**.
   - **Android:** use Chrome, tap the ⋮ menu, then **Install app** (or **Add to Home screen**).
2. Open Slow Week from its new icon. It runs full screen, and works without internet after the first visit.

Data lives on the phone only. On iPhone the home-screen app keeps its own storage, separate from Safari: to bring over data you entered in Safari, use **Export data** there and **Import data** in the app. Export now and then as a backup.

## Android helper: Kindle and Audible minutes

Slow Week can't see inside other apps, so a small Android companion app (in `android/`) reads how long you used Kindle and Audible this week and sends the minutes over.

**Install**
1. On your phone, open the [latest helper release](https://github.com/keeper575/low-dopamine-tracker/releases/tag/helper) and download `slow-week-helper.apk`.
2. Open the file. Android asks you to allow installs from your browser or file manager once; allow it, then install.
3. Open **Slow Week helper**, tap **Grant usage access**, switch it on for Slow Week helper, and come back.

**Link your goals**
In Slow Week, edit a goal (or add one) and set **Auto-fill from** to Kindle or Audible. The goal's unit must be minutes or hours.

**Sync**
Open the helper and tap **Send to Slow Week**. It opens Slow Week with this week's minutes and replaces the totals of linked goals for that week. Manual goals are never touched.

**What is counted**
- Kindle: time the Kindle app is open on screen. Leaving it open and walking away still counts.
- Audible: time it is playing, including with the screen off, plus time it is on screen.
- Pages can't be read from either app, so page goals stay manual.

The helper reads only Android's record of when apps were in use, sends nothing anywhere except the link it opens, and needs Android 10 or later. It is signed with a debug key kept in the repo (`android/debug.keystore`), so any build of it installs over the previous one; only install the APK from this repo's releases.

## Try it safely (demo mode)

Add `?demo` to the URL, or click **Try demo** at the bottom of the page. Demo mode loads sample goals and tasks into separate storage, so your real data is never touched. Use **Reset demo** to start over, or **Exit demo** to go back.

## Deploy (GitHub Pages)

When you change `style.css` or `app.js`, bump the `?v=` number on their links in `index.html`, and `VERSION` in `sw.js` to match. Browsers cache these files for a few minutes, and the new number makes them fetch the update instead of mixing an old file with a new page.

1. Push this repo to GitHub.
2. Go to **Settings → Pages**, set the source to **Deploy from a branch**, then choose `main` and `/ (root)`.
3. The site is published at `https://<username>.github.io/low-dopamine-tracker/`.

Any static host works the same way (Netlify, Cloudflare Pages, Vercel): point it at the repo root with no build command.

## Note on data

Data stays in the browser you use. Use **Export data** to back it up or to move it to another device.
