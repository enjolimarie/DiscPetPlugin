# Issue 006 — `statBar(null)` renders "null/100" instead of crashing gracefully

**File:** `commands/pet.js` line 14  
**Severity:** Low  
**Status:** Open

## Description

If a stat column in the database is `NULL` (which cannot happen through current code paths, but could result from a buggy future `updateStat` or a direct database edit), `statBar(null)` does not throw — `null / 10` coerces to `0` in JavaScript, so `Math.round(0) = 0` and `'░'.repeat(10)` succeeds. However, the resulting string is:

```
░░░░░░░░░░ null/100
```

This is silently broken output: the stat appears completely empty with a nonsensical label, and no error is surfaced to the developer or the user.

## Fix

This is addressed by the same fix proposed in Issue 003 — making `statBar` clamp its input and treat `null`/`undefined` as `0`:

```js
function statBar(value) {
  const safe   = Math.max(0, Math.min(100, Math.round(value ?? 0)));
  const filled = Math.round(safe / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${safe}/100`;
}
```

The `?? 0` coercion makes the null case explicit and renders an empty bar (`0/100`) rather than the misleading `null/100` string.
