# Issue 003 — `statBar()` throws RangeError if a stat value exceeds 100

**File:** `commands/pet.js` line 14  
**Severity:** Medium  
**Status:** Open

## Description

`statBar()` computes the number of filled blocks as `Math.round(value / 10)`. When `value > 100`, `filled` becomes greater than 10, making `10 - filled` negative. `String.prototype.repeat()` throws a `RangeError: Invalid count value` for any negative argument.

```js
// value = 110
const filled = Math.round(110 / 10); // 11
'░'.repeat(10 - 11);                 // RangeError: Invalid count value: -1
```

The `clamp()` utility in `database/db.js` exists precisely to prevent this, but it is **never called** in `createPet()` or any stat-writing path (see Issue 004). As soon as any future `feed`, `play`, or `clean` command adds points to a stat without clamping, `/pet status` will crash for that guild.

## Steps to Reproduce

1. Manually update a stat in the DB: `UPDATE pets SET hunger = 105 WHERE guild_id = '...';`
2. Run `/pet status` — the bot throws a RangeError and responds with the generic error message.

## Fix

Make `statBar` defensive against out-of-range values:

```js
function statBar(value) {
  const safe   = Math.max(0, Math.min(100, Math.round(value ?? 0)));
  const filled = Math.round(safe / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${safe}/100`;
}
```

This also covers the `null` display bug described in Issue 007.
