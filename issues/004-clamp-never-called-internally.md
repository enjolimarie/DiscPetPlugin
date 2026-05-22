# Issue 004 — `clamp()` is exported but never called on any stat-write path

**File:** `database/db.js` line 22  
**Severity:** Medium  
**Status:** Open

## Description

`clamp()` is defined and exported from `database/db.js` as the single enforcement point for keeping stats within `[0, 100]`. However, it is never called inside `createPet()` or anywhere else in the module itself. `createPet` hardcodes the initial value of 80, which is safe, but the design relies entirely on every future caller of `updateStat` (not yet implemented) remembering to apply `clamp` before writing to the database.

This is a latent design hazard: when `feed`, `play`, `clean`, and `sleep` commands are added (all marked TODO), any one of them that skips clamping will silently store out-of-range values, which then cause a `RangeError` crash in `statBar()` (Issue 003).

## Fix

Move the clamping responsibility inside the database layer. The planned `updateStat` helper should apply `clamp` unconditionally before the SQL `UPDATE`:

```js
function updateStat(guildId, stat, delta) {
  const pet = getPet(guildId);
  if (!pet) return null;
  const newVal = clamp(pet[stat] + delta);
  db.prepare(`UPDATE pets SET ${stat} = ?, last_updated = ? WHERE guild_id = ?`)
    .run(newVal, Date.now(), guildId);
  return getPet(guildId);
}
```

Callers should not need to know about `clamp` — the DB layer should enforce the invariant.
