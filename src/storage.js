/**
 * Telegram CloudStorage wrapper.
 *
 * Data layout (to stay under 4 KB per key):
 *   "app-state"   → { habits, xp, freezes, weeklyGoal }
 *   "log-YYYY-WNN" → { [date]: [habitId, ...], ... }   (one key per ISO week)
 */

const cs = () => window.Telegram?.WebApp?.CloudStorage;

// ─── low-level helpers ────────────────────────────────────────────────

function csGet(key) {
  return new Promise((resolve, reject) => {
    const storage = cs();
    if (!storage) {
      // Fallback to localStorage for dev / outside Telegram
      try {
        const v = localStorage.getItem(key);
        resolve(v ?? null);
      } catch {
        resolve(null);
      }
      return;
    }
    storage.getItem(key, (err, value) => {
      if (err) reject(err);
      else resolve(value ?? null);
    });
  });
}

function csSet(key, value) {
  return new Promise((resolve, reject) => {
    const storage = cs();
    if (!storage) {
      try { localStorage.setItem(key, value); } catch {}
      resolve();
      return;
    }
    storage.setItem(key, value, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function csGetKeys() {
  return new Promise((resolve, reject) => {
    const storage = cs();
    if (!storage) {
      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
        resolve(keys);
      } catch {
        resolve([]);
      }
      return;
    }
    storage.getKeys((err, keys) => {
      if (err) reject(err);
      else resolve(keys ?? []);
    });
  });
}

function csGetItems(keys) {
  return new Promise((resolve, reject) => {
    const storage = cs();
    if (!storage) {
      const result = {};
      keys.forEach((k) => {
        try { result[k] = localStorage.getItem(k) ?? null; } catch { result[k] = null; }
      });
      resolve(result);
      return;
    }
    storage.getItems(keys, (err, values) => {
      if (err) reject(err);
      else resolve(values ?? {});
    });
  });
}

// ─── week key helpers ────────────────────────────────────────────────

/** Returns ISO week string "YYYY-WNN" for a given date string "YYYY-MM-DD". */
function isoWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const dayOfWeek = d.getDay() || 7; // Mon=1 ... Sun=7
  d.setDate(d.getDate() + 4 - dayOfWeek); // nearest Thursday
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function logKeyForDate(dateStr) {
  return `log-${isoWeek(dateStr)}`;
}

// ─── public API ────────────────────────────────────────────────────

/** Load all data from CloudStorage. Returns { habits, xp, freezes, weeklyGoal, log }. */
export async function loadAll() {
  // 1. Get all keys to find log-* keys
  const allKeys = await csGetKeys();
  const logKeys = allKeys.filter((k) => k.startsWith('log-'));

  // 2. Fetch app-state + all log keys in one batch
  const keysToFetch = ['app-state', ...logKeys];
  const raw = await csGetItems(keysToFetch);

  // 3. Parse app-state
  let state = {};
  try { state = JSON.parse(raw['app-state'] || '{}'); } catch {}

  // 4. Merge all log weeks into one object
  const log = {};
  for (const lk of logKeys) {
    try {
      const weekData = JSON.parse(raw[lk] || '{}');
      Object.assign(log, weekData);
    } catch {}
  }

  return {
    habits: state.habits ?? null,
    xp: state.xp ?? null,
    freezes: state.freezes ?? null,
    weeklyGoal: state.weeklyGoal ?? null,
    log,
  };
}

/** Save app-state (everything except log). */
export async function saveState({ habits, xp, freezes, weeklyGoal }) {
  await csSet('app-state', JSON.stringify({ habits, xp, freezes, weeklyGoal }));
}

/** Save one day's completion data into the correct weekly log key. */
export async function saveLogDay(dateStr, dayArray) {
  const key = logKeyForDate(dateStr);
  let existing = {};
  try {
    const raw = await csGet(key);
    if (raw) existing = JSON.parse(raw);
  } catch {}
  existing[dateStr] = dayArray;
  await csSet(key, JSON.stringify(existing));
}

/** Save entire log object (used on initial migration or bulk update). */
export async function saveLogBulk(log) {
  // Group by week
  const weeks = {};
  for (const [dateStr, arr] of Object.entries(log)) {
    const key = logKeyForDate(dateStr);
    if (!weeks[key]) weeks[key] = {};
    weeks[key][dateStr] = arr;
  }
  // Save each week key
  await Promise.all(
    Object.entries(weeks).map(([key, data]) => csSet(key, JSON.stringify(data)))
  );
}
