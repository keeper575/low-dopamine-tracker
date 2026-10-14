// Slow Week: all state lives in localStorage under one key.
// Shape: {
//   activities: [{ id, name, target, unit }],
//   logs:  { "YYYY-MM-DD" (week's Monday): { [activityId]: amount } },
//   tasks: { "YYYY-MM-DD" (week's Monday): [{ id, text, done }] },
// }

const STORAGE_KEY = 'slow-week-v1';

const $ = (id) => document.getElementById(id);

let state = load();
let weekStart = mondayOf(new Date());
let editingId = null;

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && Array.isArray(data.activities)) return normalize(data);
  } catch {}
  return normalize({ activities: [] });
}

function normalize(data) {
  return { activities: data.activities, logs: data.logs || {}, tasks: data.tasks || {} };
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

function weekLabel(start) {
  const fmt = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString(undefined, fmt)} – ${addDays(start, 6).toLocaleDateString(undefined, fmt)}`;
}

// --- logs ----------------------------------------------------------------

function getAmount(activityId) {
  return state.logs[weekKey(weekStart)]?.[activityId] || 0;
}

function setAmount(activityId, amount) {
  const key = weekKey(weekStart);
  state.logs[key] ??= {};
  state.logs[key][activityId] = Math.max(0, Math.round(amount * 100) / 100);
  save();
  render();
}

// --- tasks ---------------------------------------------------------------

function weekTasks() {
  return state.tasks[weekKey(weekStart)] || [];
}

function updateTasks(fn) {
  const key = weekKey(weekStart);
  const tasks = fn(weekTasks());
  if (tasks.length) state.tasks[key] = tasks;
  else delete state.tasks[key];
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

  const done = state.activities.filter((a) => getAmount(a.id) >= a.target).length;
  const tasks = weekTasks();
  const tasksDone = tasks.filter((t) => t.done).length;
  $('summary').textContent = [
    state.activities.length && `${done} of ${state.activities.length} goals met`,
    tasks.length && `${tasksDone} of ${tasks.length} tasks done`,
  ].filter(Boolean).join(' · ');

  $('task-list').replaceChildren(...tasks.map(renderTask));
}

function renderTask(task) {
  const li = document.createElement('li');
  li.className = 'task' + (task.done ? ' done' : '');
  li.innerHTML = `
    <label><input type="checkbox"><span></span></label>
    <button type="button" class="link remove">Remove</button>`;
  li.querySelector('span').textContent = task.text;
  const box = li.querySelector('input');
  box.checked = task.done;
  box.addEventListener('change', () =>
    updateTasks((tasks) => tasks.map((t) => (t.id === task.id ? { ...t, done: box.checked } : t))));
  li.querySelector('.remove').addEventListener('click', () =>
    updateTasks((tasks) => tasks.filter((t) => t.id !== task.id)));
  return li;
}

function renderActivity(activity) {
  if (activity.id === editingId) return renderEditor(activity);
  const amount = getAmount(activity.id);
  const pct = Math.min(100, (amount / activity.target) * 100);

  const li = document.createElement('li');
  li.className = 'activity' + (amount >= activity.target ? ' done' : '');
  li.innerHTML = `
    <div class="activity-head">
      <span class="activity-name"></span>
      <span class="activity-count">${amount} / ${activity.target} ${activity.unit}</span>
    </div>
    <div class="bar"><span style="width:${pct}%"></span></div>
    <form class="log">
      <input type="number" step="any" min="0" placeholder="+ ${activity.unit}" aria-label="Amount to add">
      <button type="submit">Log</button>
      <button type="button" class="link undo">Reset</button>
      <button type="button" class="link edit">Edit</button>
      <button type="button" class="link remove">Remove</button>
    </form>`;
  li.querySelector('.activity-name').textContent = activity.name;

  const form = li.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = parseFloat(form.querySelector('input').value);
    if (!Number.isNaN(value)) setAmount(activity.id, amount + value);
  });
  li.querySelector('.undo').addEventListener('click', () => setAmount(activity.id, 0));
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
        <select name="unit" aria-label="Unit">${$('unit').innerHTML}</select>
        <button type="submit">Save</button>
        <button type="button" class="cancel">Cancel</button>
      </div>
    </form>`;
  const form = li.querySelector('form');
  form.elements.name.value = activity.name;
  form.elements.target.value = activity.target;
  form.elements.unit.value = activity.unit;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    Object.assign(activity, {
      name: form.elements.name.value.trim(),
      target: parseFloat(form.elements.target.value),
      unit: form.elements.unit.value,
    });
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

$('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  state.activities.push({
    id: crypto.randomUUID(),
    name: $('name').value.trim(),
    target: parseFloat($('target').value),
    unit: $('unit').value,
  });
  save();
  e.target.reset();
  render();
});

$('task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('task-text').value.trim();
  if (!text) return;
  updateTasks((tasks) => [...tasks, { id: crypto.randomUUID(), text, done: false }]);
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

render();
