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

// Ensures no stat ever escapes [0, 100]
const clamp = (val) => Math.max(0, Math.min(100, Math.round(val)));

function getPet(guildId) {
  return db.prepare('SELECT * FROM pets WHERE guild_id = ?').get(guildId);
}

function createPet(guildId, name, species) {
  db.prepare(`
    INSERT INTO pets (guild_id, pet_name, species, hunger, mood, energy, cleanliness, level, xp, last_updated)
    VALUES (?, ?, ?, 80, 80, 80, 80, 1, 0, ?)
  `).run(guildId, name, species, Date.now());
  return getPet(guildId);
}

function deletePet(guildId) {
  db.prepare('DELETE FROM pets WHERE guild_id = ?').run(guildId);
}

// XP required to advance from `level` to `level + 1`
function xpToNextLevel(level) {
  return level * 100;
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

module.exports = { getPet, createPet, deletePet, updateStat, addXP, xpToNextLevel, applyDecay, DECAY_PER_HOUR, clamp };
