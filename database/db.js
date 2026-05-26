const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = process.env.TEST_DB_PATH ?? path.join(__dirname, '..', 'pets.db');
const db = new Database(DB_PATH);

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

// Add new columns to existing databases that were created before these were added
for (const sql of [
  'ALTER TABLE pets ADD COLUMN treats     INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE pets ADD COLUMN last_daily INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE pets ADD COLUMN streak     INTEGER NOT NULL DEFAULT 1',
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
  db.prepare('UPDATE pets SET treats = treats - ?, last_updated = ? WHERE guild_id = ?')
    .run(amount, Date.now(), guildId);
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

module.exports = { getPet, createPet, deletePet, renamePet, updateStat, addXP, xpToNextLevel, applyDecay, DECAY_PER_HOUR, claimDaily, DAILY_XP, DAILY_TREATS, spendTreats, clamp, streakMultiplier };
