// Slow Week: all state lives in localStorage under one key.
// Shape (weeks are keyed by their Monday, "YYYY-MM-DD"):
// {
//   activities: [{ id, name, target, unit, since, source }],  // since: first week the goal counts;
//                                                             // source: 'kindle' | 'audible' to auto-fill
//   lastSync: { week, minutes: { kindle, audible }, at },     // last numbers from the Android helper
//   logs:  { [week]: { [activityId]: amount } },
//   tasks: [{ id, text, week, doneWeek }],            // week added; doneWeek is null until ticked
// }
//
// Carry-over: a goal's target for a week is its base target plus whatever is still owed from
// earlier weeks, so a shortfall keeps rolling forward until it is made up. A task shows in every
// week from the one it was added until the one it was ticked in.

// ?demo runs on separate storage seeded with sample data, so trying things out never touches real data.
const DEMO = new URLSearchParams(location.search).has('demo');
const STORAGE_KEY = DEMO ? 'slow-week-demo' : 'slow-week-v1';

const $ = (id) => document.getElementById(id);

// Goals that can be filled in by the Android helper app (android/). It opens
// ?sync=1&week=YYYY-MM-DD&kindle=<minutes>&audible=<minutes>.
const SOURCES = { kindle: 'Kindle', audible: 'Audible' };

let weekStart = mondayOf(new Date());
let state = load();
let editingId = null;

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && Array.isArray(data.activities)) return normalize(data);
  } catch {}
  return DEMO ? demoData() : normalize({ activities: [] });
}

function demoData() {
  const week = weekKey(mondayOf(new Date()));
  const lastWeek = weekKey(addDays(mondayOf(new Date()), -7));
  return normalize({
    activities: [
      { id: 'kindle', name: 'Read Kindle', target: 2, unit: 'hours', since: lastWeek, source: 'kindle' },
      { id: 'pages', name: 'Read a book', target: 50, unit: 'pages', since: lastWeek },
      { id: 'walk', name: 'Walk outside', target: 10, unit: 'km', since: lastWeek },
      { id: 'sudoku', name: 'Sudoku', target: 5, unit: 'puzzles', since: week },
    ],
    logs: { [week]: { kindle: 1.5, pages: 50, walk: 4, sudoku: 2 }, [lastWeek]: { kindle: 2, pages: 30, walk: 12 } },
    tasks: [
      { id: 't1', text: 'Clean the bookshelf', week, doneWeek: week },
      { id: 't2', text: 'Call grandma', week, doneWeek: null },
      { id: 't3', text: 'Return library books', week: lastWeek, doneWeek: null },
    ],
  });
}

// Also upgrades older saves: goals get a start week, and per-week task lists become one list.
function normalize(data) {
  const logs = data.logs || {};
  const thisWeek = weekKey(mondayOf(new Date()));
  const activities = data.activities.map((a) => {
    if (a.since) return a;
    const logged = Object.keys(logs).filter((w) => logs[w][a.id] != null).sort();
    return { ...a, since: logged[0] || thisWeek };
  });
  let tasks = data.tasks || [];
  if (!Array.isArray(tasks)) {
    tasks = Object.entries(tasks).flatMap(([week, list]) =>
      list.map((t) => ({ id: t.id, text: t.text, week, doneWeek: t.done ? week : null })));
  }
  return { activities, logs, tasks, lastSync: data.lastSync || null };
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// --- dates ---------------------------------------------------------------

function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function weekKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function shortDate(key) {
  return parseKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function weekLabel(start) {
  const fmt = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString(undefined, fmt)} – ${addDays(start, 6).toLocaleDateString(undefined, fmt)}`;
}

// --- logs ----------------------------------------------------------------

function amountIn(week, activityId) {
  return state.logs[week]?.[activityId] || 0;
}

function getAmount(activityId) {
  return amountIn(weekKey(weekStart), activityId);
}

// Amount still owed from weeks before `week`. Doing more than a week's target pays the backlog
// down, but never builds up credit for later weeks.
function carriedInto(activity, week) {
  let owed = 0;
  for (let d = parseKey(activity.since); weekKey(d) < week; d = addDays(d, 7)) {
    owed = Math.max(0, activity.target + owed - amountIn(weekKey(d), activity.id));
  }
  return Math.round(owed * 100) / 100;
}

function setAmount(activityId, amount) {
  const key = weekKey(weekStart);
  state.logs[key] ??= {};
  state.logs[key][activityId] = Math.max(0, Math.round(amount * 100) / 100);
  save();
  render();
}

// --- sync from the Android helper ----------------------------------------

// Minutes convert into goals measured in minutes or hours; other units can't be auto-filled.
function minutesFactor(unit) {
  if (/^(m|mins?|minutes?)$/i.test(unit.trim())) return 1;
  if (/^(h|hrs?|hours?)$/i.test(unit.trim())) return 1 / 60;
  return null;
}

function readSync() {
  const params = new URLSearchParams(location.search);
  const week = params.get('week') || '';
  if (!params.has('sync') || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return null;
  const minutes = {};
  for (const key of Object.keys(SOURCES)) {
    const n = Number(params.get(key));
    if (params.has(key) && Number.isFinite(n) && n >= 0) minutes[key] = n;
  }
  return { week, minutes, at: new Date().toISOString() };
}

// Sets each linked goal's total for the synced week. Returns the goals it filled.
function applySync(sync) {
  const filled = [];
  for (const a of state.activities) {
    const minutes = a.source ? sync.minutes[a.source] : undefined;
    const factor = minutesFactor(a.unit);
    if (minutes == null || factor == null) continue;
    state.logs[sync.week] ??= {};
    state.logs[sync.week][a.id] = Math.round(minutes * factor * 100) / 100;
    filled.push(a);
  }
  return filled;
}

function formatMinutes(total) {
  const h = Math.floor(total / 60), m = Math.round(total % 60);
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

function showNotice(text) {
  $('notice-text').textContent = text;
  $('notice').hidden = false;
}

function sourceOptions(selected) {
  return [['', 'Manual only'], ...Object.entries(SOURCES).map(([k, v]) => [k, `${v} (Android helper)`])]
    .map(([k, v]) => `<option value="${k}"${k === (selected || '') ? ' selected' : ''}>${v}</option>`).join('');
}

// Shown on the select itself, so the browser points at it when the form is submitted.
function checkSource(select, unit) {
  select.setCustomValidity(select.value && minutesFactor(unit) == null
    ? 'Auto-fill gives minutes, so set the unit to minutes or hours.' : '');
  return select.reportValidity();
}

// --- tasks ---------------------------------------------------------------

function weekTasks() {
  const week = weekKey(weekStart);
  return state.tasks.filter((t) => t.week <= week && (t.doneWeek == null || t.doneWeek >= week));
}

function updateTask(id, changes) {
  state.tasks = state.tasks.flatMap((t) => (t.id !== id ? [t] : changes ? [{ ...t, ...changes }] : []));
  save();
  render();
}

// --- render --------------------------------------------------------------

function render() {
  const isThisWeek = weekKey(weekStart) === weekKey(mondayOf(new Date()));
  $('week-label').textContent = isThisWeek ? `This week · ${weekLabel(weekStart)}` : weekLabel(weekStart);
  $('this-week').hidden = isThisWeek;

  const list = $('activity-list');
  list.replaceChildren(...state.activities.map(renderActivity));
  $('empty').hidden = state.activities.length > 0;

  const week = weekKey(weekStart);
  const done = state.activities.filter((a) => getAmount(a.id) >= a.target + carriedInto(a, week)).length;
  const tasks = weekTasks();
  const tasksDone = tasks.filter((t) => t.doneWeek === week).length;
  $('summary').textContent = [
    state.activities.length && `${done} of ${state.activities.length} goals met`,
    tasks.length && `${tasksDone} of ${tasks.length} tasks done`,
  ].filter(Boolean).join(' · ');

  $('task-list').replaceChildren(...tasks.map(renderTask));
}

function renderTask(task) {
  const week = weekKey(weekStart);
  const done = task.doneWeek === week;
  const li = document.createElement('li');
  li.className = 'task' + (done ? ' done' : '');
  li.innerHTML = `
    <label><input type="checkbox"><span></span><small class="carried"></small></label>
    <button type="button" class="link remove">Remove</button>`;
  li.querySelector('span').textContent = task.text;
  if (task.week < week) li.querySelector('.carried').textContent = `from ${shortDate(task.week)}`;
  const box = li.querySelector('input');
  box.checked = done;
  box.addEventListener('change', () => updateTask(task.id, { doneWeek: box.checked ? week : null }));
  li.querySelector('.remove').addEventListener('click', () => updateTask(task.id, null));
  return li;
}

function renderActivity(activity) {
  if (activity.id === editingId) return renderEditor(activity);
  const amount = getAmount(activity.id);
  const carried = carriedInto(activity, weekKey(weekStart));
  const target = activity.target + carried;
  const pct = Math.min(100, (amount / target) * 100);

  const li = document.createElement('li');
  li.className = 'activity' + (amount >= target ? ' done' : '');
  li.innerHTML = `
    <div class="activity-head">
      <span class="activity-name"></span>
      <span class="activity-count"></span>
    </div>
    <div class="carry" hidden></div>
    <div class="auto" hidden></div>
    <div class="bar"><span style="width:${pct}%"></span></div>
    <form class="log">
      <input type="number" step="any" min="0" aria-label="Amount">
      <button type="submit">Add</button>
      <button type="button" class="set">Set total</button>
      <button type="button" class="link edit">Edit</button>
      <button type="button" class="link remove">Remove</button>
    </form>`;
  li.querySelector('.activity-name').textContent = activity.name;
  li.querySelector('.activity-count').textContent = `${amount} / ${target} ${activity.unit}`;
  if (carried) {
    const note = li.querySelector('.carry');
    note.hidden = false;
    note.textContent = `${activity.target} this week + ${carried} carried over`;
  }
  if (activity.source) {
    const auto = li.querySelector('.auto');
    auto.hidden = false;
    auto.textContent = `Auto-filled from ${SOURCES[activity.source]} by the Android helper`;
  }

  // "Add" logs a session on top of the week's total; "Set total" overwrites it (0 clears the week).
  const form = li.querySelector('form');
  const input = form.querySelector('input');
  input.placeholder = '0';
  const value = () => parseFloat(input.value);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!Number.isNaN(value())) setAmount(activity.id, amount + value());
  });
  li.querySelector('.set').addEventListener('click', () => {
    if (!Number.isNaN(value())) setAmount(activity.id, value());
    else input.focus();
  });
  li.querySelector('.edit').addEventListener('click', () => { editingId = activity.id; render(); });
  li.querySelector('.remove').addEventListener('click', () => removeActivity(activity));
  return li;
}

function renderEditor(activity) {
  const li = document.createElement('li');
  li.className = 'activity';
  li.innerHTML = `
    <form class="edit-form">
      <input name="name" required maxlength="60" aria-label="Activity name">
      <div class="row">
        <input name="target" type="number" min="0.25" step="any" required aria-label="Weekly target">
        <input name="unit" required maxlength="20" list="unit-suggestions" aria-label="Unit">
        <button type="submit">Save</button>
        <button type="button" class="cancel">Cancel</button>
      </div>
      <label class="source-field">Auto-fill from <select name="source">${sourceOptions(activity.source)}</select></label>
    </form>`;
  const form = li.querySelector('form');
  form.elements.name.value = activity.name;
  form.elements.target.value = activity.target;
  form.elements.unit.value = activity.unit;
  form.addEventListener('input', () => form.elements.source.setCustomValidity(''));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!checkSource(form.elements.source, form.elements.unit.value)) return;
    Object.assign(activity, {
      name: form.elements.name.value.trim(),
      target: parseFloat(form.elements.target.value),
      unit: form.elements.unit.value.trim(),
      source: form.elements.source.value || undefined,
    });
    if (activity.source && state.lastSync) applySync(state.lastSync);
    editingId = null;
    save();
    render();
  });
  li.querySelector('.cancel').addEventListener('click', () => { editingId = null; render(); });
  queueMicrotask(() => form.elements.target.focus());
  return li;
}

// --- actions -------------------------------------------------------------

function removeActivity(activity) {
  if (!confirm(`Remove "${activity.name}"? Its history will be deleted too.`)) return;
  state.activities = state.activities.filter((a) => a.id !== activity.id);
  for (const week of Object.values(state.logs)) delete week[activity.id];
  save();
  render();
}

$('source').innerHTML = sourceOptions('');
$('add-form').addEventListener('input', () => $('source').setCustomValidity(''));

$('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!checkSource($('source'), $('unit').value)) return;
  state.activities.push({
    id: crypto.randomUUID(),
    name: $('name').value.trim(),
    target: parseFloat($('target').value),
    unit: $('unit').value.trim(),
    since: weekKey(weekStart),
    source: $('source').value || undefined,
  });
  if (state.lastSync) applySync(state.lastSync);
  save();
  e.target.reset();
  toggleAddForm(false);
  render();
});

// The form sits in a <details>, so it opens and closes even if this script fails to load.
function toggleAddForm(open) {
  $('add-goal').open = open;
}

$('add-goal').addEventListener('toggle', () => { if ($('add-goal').open) $('name').focus(); });
$('hide-add').addEventListener('click', () => { $('add-form').reset(); toggleAddForm(false); });

$('task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('task-text').value.trim();
  if (!text) return;
  state.tasks.push({ id: crypto.randomUUID(), text, week: weekKey(weekStart), doneWeek: null });
  save();
  render();
  e.target.reset();
});

$('prev-week').addEventListener('click', () => { weekStart = addDays(weekStart, -7); render(); });
$('next-week').addEventListener('click', () => { weekStart = addDays(weekStart, 7); render(); });
$('this-week').addEventListener('click', () => { weekStart = mondayOf(new Date()); render(); });

$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `slow-week-${weekKey(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.activities)) throw new Error();
    if (!confirm('Replace current data with the imported file?')) return;
    state = normalize(data);
    save();
    render();
  } catch {
    alert('That file does not look like a Slow Week export.');
  } finally {
    e.target.value = '';
  }
});

// Lets the app install to a phone's home screen and work offline (needs http(s), not file://).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

$('notice-close').addEventListener('click', () => { $('notice').hidden = true; });

// Numbers sent by the Android helper: fill linked goals, then drop the query so a reload doesn't repeat it.
const incoming = DEMO ? null : readSync();
if (incoming) {
  state.lastSync = incoming;
  const filled = applySync(incoming);
  save();
  history.replaceState(null, '', location.pathname);
  weekStart = parseKey(incoming.week);
  const got = Object.entries(incoming.minutes).map(([k, m]) => `${SOURCES[k]} ${formatMinutes(m)}`).join(', ');
  const unfit = state.activities.filter((a) => a.source && minutesFactor(a.unit) == null);
  showNotice([
    `Synced from the helper: ${got || 'nothing to report'}.`,
    filled.length
      ? `Filled in ${filled.map((a) => a.name).join(', ')}.`
      : 'No goal is set to auto-fill yet: edit a goal and choose "Auto-fill from".',
    ...unfit.map((a) => `${a.name} can't be filled: its unit needs to be minutes or hours.`),
  ].join(' '));
}

if (DEMO) {
  $('demo-banner').hidden = false;
  $('demo-reset').addEventListener('click', () => { state = demoData(); save(); render(); });
}

render();
