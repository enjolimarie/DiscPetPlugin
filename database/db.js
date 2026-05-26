const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = process.env.TEST_DB_PATH ?? path.join(__dirname, '..', 'pets.db');
const db = new Database(DB_PATH);

const TASK_POOL = [
  { key: 'feed_once',     label: 'Hungry Buddy',    description: 'Feed your pet once.',          action: 'feed',  target: 1, treats: 5,  xp: 15, emoji: '🍖' },
  { key: 'feed_twice',    label: 'Well Fed',         description: 'Feed your pet twice.',         action: 'feed',  target: 2, treats: 8,  xp: 20, emoji: '🍽️' },
  { key: 'play_once',     label: 'Playtime!',        description: 'Play with your pet once.',     action: 'play',  target: 1, treats: 5,  xp: 15, emoji: '🎾' },
  { key: 'play_twice',    label: 'Active Day',       description: 'Play with your pet twice.',    action: 'play',  target: 2, treats: 8,  xp: 20, emoji: '🎪' },
  { key: 'clean_once',    label: 'Squeaky Clean',    description: 'Clean your pet once.',         action: 'clean', target: 1, treats: 5,  xp: 15, emoji: '🛁' },
  { key: 'clean_twice',   label: 'Spa Day',          description: 'Clean your pet twice.',        action: 'clean', target: 2, treats: 8,  xp: 20, emoji: '🧼' },
  { key: 'sleep_once',    label: 'Nap Time',         description: 'Let your pet rest once.',      action: 'sleep', target: 1, treats: 5,  xp: 15, emoji: '💤' },
  { key: 'sleep_twice',   label: 'Beauty Sleep',     description: 'Let your pet rest twice.',     action: 'sleep', target: 2, treats: 7,  xp: 18, emoji: '😴' },
  { key: 'daily_checkin', label: 'Daily Check-In',   description: 'Claim your daily reward.',     action: 'daily', target: 1, treats: 10, xp: 25, emoji: '🎁' },
  { key: 'shop_purchase', label: 'Treat Yourself',   description: 'Buy something from the shop.', action: 'buy',   target: 1, treats: 10, xp: 25, emoji: '🛒' },
];

db.exec(`
  CREATE TABLE IF NOT EXISTS pets (
    guild_id    TEXT    PRIMARY KEY,
    pet_name    TEXT    NOT NULL,
    species     TEXT    NOT NULL,
    hunger      INTEGER NOT NULL DEFAULT 80,
    mood        INTEGER NOT NULL DEFAULT 80,
    energy      INTEGER NOT NULL DEFAULT 80,
    cleanliness INTEGER NOT NULL DEFAULT 80,
    level       INTEGER NOT NULL DEFAULT 1,
    xp          INTEGER NOT NULL DEFAULT 0,
    last_updated INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS daily_tasks (
    guild_id  TEXT    NOT NULL,
    task_date TEXT    NOT NULL,
    task_key  TEXT    NOT NULL,
    progress  INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, task_date, task_key)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS inventory (
    guild_id  TEXT    NOT NULL,
    user_id   TEXT    NOT NULL,
    item_key  TEXT    NOT NULL,
    quantity  INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (guild_id, user_id, item_key)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS achievements (
    guild_id  TEXT    NOT NULL,
    user_id   TEXT    NOT NULL,
    badge_key TEXT    NOT NULL,
    earned_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id, badge_key)
  )
`);

// Add new columns to existing databases that were created before these were added
for (const sql of [
  'ALTER TABLE pets ADD COLUMN treats              INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE pets ADD COLUMN last_daily          INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE pets ADD COLUMN streak              INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE pets ADD COLUMN feed_count          INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE pets ADD COLUMN play_count          INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE pets ADD COLUMN items_bought_count  INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE pets ADD COLUMN treats_spent_total  INTEGER NOT NULL DEFAULT 0',
]) {
  try { db.exec(sql); } catch { /* column already exists */ }
}

// Ensures no stat ever escapes [0, 100]
const clamp = (val) => Math.max(0, Math.min(100, Math.round(val)));

function getPet(guildId) {
  return db.prepare('SELECT * FROM pets WHERE guild_id = ?').get(guildId);
}

function createPet(guildId, name, species) {
  db.prepare(`
    INSERT INTO pets (guild_id, pet_name, species, hunger, mood, energy, cleanliness, level, xp, last_updated, treats, last_daily)
    VALUES (?, ?, ?, 80, 80, 80, 80, 1, 0, ?, 0, 0)
  `).run(guildId, name, species, Date.now());
  return getPet(guildId);
}

function deletePet(guildId) {
  db.prepare('DELETE FROM pets WHERE guild_id = ?').run(guildId);
}

function renamePet(guildId, newName) {
  db.prepare('UPDATE pets SET pet_name = ?, last_updated = ? WHERE guild_id = ?')
    .run(newName, Date.now(), guildId);
  return getPet(guildId);
}

// XP required to advance from `level` to `level + 1`
// Baby 1-5: 100 XP/level, Child 6-15: 250, Teen 16-30: 500, Adult 31+: 1000
function xpToNextLevel(level) {
  if (level <= 5)  return 100;
  if (level <= 15) return 250;
  if (level <= 30) return 500;
  return 1000;
}

// Stat points lost per hour of inactivity
const DECAY_PER_HOUR = {
  hunger:      3,
  mood:        2,
  energy:      1.5,
  cleanliness: 1,
};

function applyDecay(guildId) {
  const pet = getPet(guildId);
  if (!pet) return null;

  const hoursElapsed = (Date.now() - pet.last_updated) / (1000 * 60 * 60);
  if (hoursElapsed <= 0) return pet;

  const hunger      = clamp(pet.hunger      - DECAY_PER_HOUR.hunger      * hoursElapsed);
  const mood        = clamp(pet.mood        - DECAY_PER_HOUR.mood        * hoursElapsed);
  const energy      = clamp(pet.energy      - DECAY_PER_HOUR.energy      * hoursElapsed);
  const cleanliness = clamp(pet.cleanliness - DECAY_PER_HOUR.cleanliness * hoursElapsed);

  db.prepare(`
    UPDATE pets SET hunger = ?, mood = ?, energy = ?, cleanliness = ?, last_updated = ?
    WHERE guild_id = ?
  `).run(hunger, mood, energy, cleanliness, Date.now(), guildId);

  return getPet(guildId);
}

const VALID_STATS = new Set(['hunger', 'mood', 'energy', 'cleanliness']);

function updateStat(guildId, stat, delta) {
  if (!VALID_STATS.has(stat)) throw new Error(`Invalid stat: ${stat}`);
  const pet = getPet(guildId);
  if (!pet) return;
  const newVal = clamp(pet[stat] + delta);
  db.prepare(`UPDATE pets SET ${stat} = ?, last_updated = ? WHERE guild_id = ?`)
    .run(newVal, Date.now(), guildId);
}

function addXP(guildId, amount) {
  const pet = getPet(guildId);
  if (!pet) return;
  let { xp, level } = pet;
  xp += amount;
  while (xp >= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level);
    level++;
  }
  db.prepare('UPDATE pets SET xp = ?, level = ?, last_updated = ? WHERE guild_id = ?')
    .run(xp, level, Date.now(), guildId);
}

function spendTreats(guildId, amount) {
  const pet = getPet(guildId);
  if (!pet || pet.treats < amount) return false;
  db.prepare('UPDATE pets SET treats = treats - ?, treats_spent_total = treats_spent_total + ?, last_updated = ? WHERE guild_id = ?')
    .run(amount, amount, Date.now(), guildId);
  return true;
}

const DAILY_XP     = 50;
const DAILY_TREATS = 5;

function streakMultiplier(streak) {
  if (streak >= 30) return 2;
  if (streak >= 7)  return 1.5;
  return 1;
}

function claimDaily(guildId) {
  const pet = getPet(guildId);
  if (!pet) return null;

  const now  = Date.now();
  const last = new Date(pet.last_daily);
  const curr = new Date(now);
  const alreadyClaimed =
    pet.last_daily > 0 &&
    last.getUTCFullYear() === curr.getUTCFullYear() &&
    last.getUTCMonth()    === curr.getUTCMonth()    &&
    last.getUTCDate()     === curr.getUTCDate();

  if (alreadyClaimed) {
    const nextMidnight = new Date(now);
    nextMidnight.setUTCHours(24, 0, 0, 0);
    return { claimed: false, msUntilReset: nextMidnight.getTime() - now };
  }

  // Streak: increment if last_daily was exactly yesterday (UTC), otherwise reset to 1
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const wasYesterday =
    pet.last_daily > 0 &&
    last.getUTCFullYear() === yesterday.getUTCFullYear() &&
    last.getUTCMonth()    === yesterday.getUTCMonth()    &&
    last.getUTCDate()     === yesterday.getUTCDate();

  const newStreak  = wasYesterday ? (pet.streak ?? 1) + 1 : 1;
  const multiplier = streakMultiplier(newStreak);
  const xp         = Math.round(DAILY_XP     * multiplier);
  const treats     = Math.round(DAILY_TREATS * multiplier);

  addXP(guildId, xp);
  db.prepare('UPDATE pets SET treats = treats + ?, last_daily = ?, streak = ?, last_updated = ? WHERE guild_id = ?')
    .run(treats, now, newStreak, now, guildId);

  return { claimed: true, xp, treats, streak: newStreak, multiplier, pet: getPet(guildId) };
}

function addToInventory(guildId, userId, itemKey) {
  db.prepare(`
    INSERT INTO inventory (guild_id, user_id, item_key, quantity) VALUES (?, ?, ?, 1)
    ON CONFLICT(guild_id, user_id, item_key) DO UPDATE SET quantity = quantity + 1
  `).run(guildId, userId, itemKey);
}

function getInventory(guildId, userId) {
  return db.prepare('SELECT * FROM inventory WHERE guild_id = ? AND user_id = ? ORDER BY item_key')
    .all(guildId, userId);
}

function useFromInventory(guildId, userId, itemKey) {
  const row = db.prepare('SELECT quantity FROM inventory WHERE guild_id = ? AND user_id = ? AND item_key = ?')
    .get(guildId, userId, itemKey);
  if (!row) return false;
  if (row.quantity === 1) {
    db.prepare('DELETE FROM inventory WHERE guild_id = ? AND user_id = ? AND item_key = ?')
      .run(guildId, userId, itemKey);
  } else {
    db.prepare('UPDATE inventory SET quantity = quantity - 1 WHERE guild_id = ? AND user_id = ? AND item_key = ?')
      .run(guildId, userId, itemKey);
  }
  return true;
}

function getUtcDateKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

// Returns today's 3 tasks for the guild, generating them if this is the first call of the day.
function getTodayTasks(guildId, now = Date.now()) {
  const dateKey = getUtcDateKey(now);
  const existing = db.prepare('SELECT * FROM daily_tasks WHERE guild_id = ? AND task_date = ? ORDER BY rowid')
    .all(guildId, dateKey);
  if (existing.length > 0) return existing;

  // Pick 3 tasks with no two sharing the same action type
  const shuffled = [...TASK_POOL].sort(() => Math.random() - 0.5);
  const usedActions = new Set();
  const selected    = [];
  for (const task of shuffled) {
    if (!usedActions.has(task.action) && selected.length < 3) {
      usedActions.add(task.action);
      selected.push(task);
    }
  }

  const insert = db.prepare(
    'INSERT INTO daily_tasks (guild_id, task_date, task_key, progress, completed) VALUES (?, ?, ?, 0, 0)',
  );
  for (const task of selected) insert.run(guildId, dateKey, task.key);

  return db.prepare('SELECT * FROM daily_tasks WHERE guild_id = ? AND task_date = ? ORDER BY rowid')
    .all(guildId, dateKey);
}

// Called after each action. Increments matching task progress; awards treats+XP on completion.
// Returns an array of task defs that were newly completed this call.
function recordTaskAction(guildId, actionType, now = Date.now()) {
  const pet = getPet(guildId);
  if (!pet) return [];

  const dateKey  = getUtcDateKey(now);
  const tasks    = getTodayTasks(guildId, now);
  const newlyDone = [];

  for (const row of tasks) {
    if (row.completed) continue;
    const def = TASK_POOL.find(t => t.key === row.task_key);
    if (!def || def.action !== actionType) continue;

    const next = row.progress + 1;
    if (next >= def.target) {
      db.prepare('UPDATE daily_tasks SET progress = ?, completed = 1 WHERE guild_id = ? AND task_date = ? AND task_key = ?')
        .run(def.target, guildId, dateKey, row.task_key);
      db.prepare('UPDATE pets SET treats = treats + ?, last_updated = ? WHERE guild_id = ?')
        .run(def.treats, Date.now(), guildId);
      addXP(guildId, def.xp);
      newlyDone.push(def);
    } else {
      db.prepare('UPDATE daily_tasks SET progress = ? WHERE guild_id = ? AND task_date = ? AND task_key = ?')
        .run(next, guildId, dateKey, row.task_key);
    }
  }

  return newlyDone;
}

function incrementActionCount(guildId, action) {
  const col = { feed: 'feed_count', play: 'play_count' }[action];
  if (!col) return;
  db.prepare(`UPDATE pets SET ${col} = ${col} + 1 WHERE guild_id = ?`).run(guildId);
}

function incrementItemsBought(guildId) {
  db.prepare('UPDATE pets SET items_bought_count = items_bought_count + 1 WHERE guild_id = ?').run(guildId);
}

// Defined after getTodayTasks / getInventory so the check closures can reference them.
const BADGE_DEFINITIONS = [
  // ── Starter ──────────────────────────────────────────────────────────────────
  {
    key: 'first_meal',    label: 'First Meal',     emoji: '🍖',
    description: 'Feed your pet for the first time.',
    check: (pet) => pet.feed_count >= 1,
  },
  {
    key: 'playmate',      label: 'Playmate',        emoji: '🎾',
    description: 'Play with your pet for the first time.',
    check: (pet) => pet.play_count >= 1,
  },
  {
    key: 'daily_devotee', label: 'Daily Devotee',   emoji: '🎁',
    description: 'Claim your first daily reward.',
    check: (pet) => pet.last_daily > 0,
  },
  {
    key: 'window_shopper', label: 'Window Shopper', emoji: '🛒',
    description: 'Buy your first item from the shop.',
    check: (pet) => pet.items_bought_count >= 1,
  },
  // ── Engagement ───────────────────────────────────────────────────────────────
  {
    key: 'on_a_roll',     label: 'On a Roll',       emoji: '🔥',
    description: 'Maintain a 7-day daily streak.',
    check: (pet) => (pet.streak ?? 1) >= 7,
  },
  {
    key: 'treat_hoarder', label: 'Treat Hoarder',   emoji: '💰',
    description: 'Accumulate 50 treats at once.',
    check: (pet) => pet.treats >= 50,
  },
  {
    key: 'growing_up',    label: 'Growing Up',      emoji: '🌱',
    description: 'Reach the Child life stage (level 6).',
    check: (pet) => pet.level >= 6,
  },
  {
    key: 'collector',     label: 'Collector',       emoji: '🎒',
    description: 'Own 3 of the same item in your inventory.',
    check: (pet, guildId, userId) => getInventory(guildId, userId).some(r => r.quantity >= 3),
  },
  {
    key: 'taskmaster',    label: 'Taskmaster',      emoji: '📋',
    description: 'Complete all 3 daily tasks in a single day.',
    check: (pet, guildId, userId, now) => {
      const rows = getTodayTasks(guildId, now);
      return rows.length === 3 && rows.every(r => r.completed === 1);
    },
  },
  {
    key: 'best_friend',   label: 'Best Friend',     emoji: '😊',
    description: "Have your pet reach the 'Happy' mood state.",
    check: (pet, guildId, userId, now) => {
      const hoursSince = (now - pet.last_updated) / (1000 * 60 * 60);
      return pet.cleanliness >= 20 && pet.hunger >= 50 && pet.energy >= 50 && pet.mood >= 70 && hoursSince <= 8;
    },
  },
  // ── Dedication ───────────────────────────────────────────────────────────────
  {
    key: 'teen_spirit',   label: 'Teen Spirit',     emoji: '⚡',
    description: 'Reach the Teen life stage (level 16).',
    check: (pet) => pet.level >= 16,
  },
  {
    key: 'streak_legend', label: 'Streak Legend',   emoji: '🌟',
    description: 'Maintain a 30-day daily streak.',
    check: (pet) => (pet.streak ?? 1) >= 30,
  },
  {
    key: 'big_spender',   label: 'Big Spender',     emoji: '💸',
    description: 'Spend 100 treats total in the shop.',
    check: (pet) => pet.treats_spent_total >= 100,
  },
  {
    key: 'all_grown_up',  label: 'All Grown Up',    emoji: '👑',
    description: 'Reach the Adult life stage (level 31).',
    check: (pet) => pet.level >= 31,
  },
  {
    key: 'bottomless_pit', label: 'Bottomless Pit', emoji: '🍽️',
    description: 'Feed your pet 50 times.',
    check: (pet) => pet.feed_count >= 50,
  },
];

function getEarnedBadges(guildId, userId) {
  return db.prepare('SELECT badge_key, earned_at FROM achievements WHERE guild_id = ? AND user_id = ? ORDER BY earned_at')
    .all(guildId, userId);
}

// Checks all badge conditions against current state and awards any not yet earned.
// Returns an array of newly earned badge defs so callers can notify the user inline.
function checkBadges(guildId, userId, now = Date.now()) {
  const pet = getPet(guildId);
  if (!pet) return [];

  const earned = new Set(getEarnedBadges(guildId, userId).map(r => r.badge_key));
  const newBadges = [];

  for (const badge of BADGE_DEFINITIONS) {
    if (earned.has(badge.key)) continue;
    try {
      if (badge.check(pet, guildId, userId, now)) {
        db.prepare('INSERT OR IGNORE INTO achievements (guild_id, user_id, badge_key, earned_at) VALUES (?, ?, ?, ?)')
          .run(guildId, userId, badge.key, now);
        newBadges.push(badge);
      }
    } catch { /* skip any badge whose check throws */ }
  }

  return newBadges;
}

module.exports = { getPet, createPet, deletePet, renamePet, updateStat, addXP, xpToNextLevel, applyDecay, DECAY_PER_HOUR, claimDaily, DAILY_XP, DAILY_TREATS, spendTreats, clamp, streakMultiplier, getTodayTasks, recordTaskAction, TASK_POOL, getUtcDateKey, addToInventory, getInventory, useFromInventory, incrementActionCount, incrementItemsBought, BADGE_DEFINITIONS, getEarnedBadges, checkBadges };
