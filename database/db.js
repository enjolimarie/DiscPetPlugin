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

// TODO: updateStat(guildId, stat, delta) — apply a delta to one stat column, clamped to [0, 100];
//       update last_updated; used by feed, play, clean, sleep commands.

// TODO: addXP(guildId, amount) — add XP to the pet and trigger a level-up when the threshold
//       is reached (define a level → XP threshold table here).

module.exports = { getPet, createPet, deletePet, clamp };
