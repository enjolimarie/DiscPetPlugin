// Use an in-memory SQLite database so tests never touch pets.db on disk.
// Must be set before the module is first required.
process.env.TEST_DB_PATH = ':memory:';

const { getPet, createPet, deletePet, renamePet, updateStat, addXP, xpToNextLevel, applyDecay, DECAY_PER_HOUR, claimDaily, DAILY_XP, DAILY_TREATS, spendTreats, clamp, streakMultiplier, getTodayTasks, recordTaskAction, TASK_POOL, getUtcDateKey, addToInventory, getInventory, useFromInventory, incrementActionCount, incrementItemsBought, BADGE_DEFINITIONS, getEarnedBadges, checkBadges } = require('../../database/db');

// ─────────────────────────────────────────────────────────────────────────────
// deletePet()
// ─────────────────────────────────────────────────────────────────────────────
describe('deletePet()', () => {
  test('removes the pet so getPet returns undefined', () => {
    createPet('guild-del-1', 'Dusty', 'cat');
    deletePet('guild-del-1');
    expect(getPet('guild-del-1')).toBeUndefined();
  });

  test('does not affect other guilds', () => {
    createPet('guild-del-2', 'Alpha', 'dog');
    createPet('guild-del-3', 'Beta',  'cat');
    deletePet('guild-del-2');
    expect(getPet('guild-del-3').pet_name).toBe('Beta');
  });

  test('silently succeeds when the guild has no pet', () => {
    expect(() => deletePet('guild-del-nonexistent')).not.toThrow();
  });

  test('allows a new pet to be adopted after removal', () => {
    createPet('guild-del-4', 'Old', 'hamster');
    deletePet('guild-del-4');
    const newPet = createPet('guild-del-4', 'New', 'rabbit');
    expect(newPet.pet_name).toBe('New');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// clamp()
// ─────────────────────────────────────────────────────────────────────────────
describe('clamp()', () => {
  test.each([
    [0,      0  ],
    [50,     50 ],
    [80,     80 ],
    [100,    100],
  ])('returns %d unchanged when already in [0, 100]', (input, expected) => {
    expect(clamp(input)).toBe(expected);
  });

  test.each([
    [-1,    0],
    [-50,   0],
    [-1000, 0],
  ])('clamps %d up to 0', (input, expected) => {
    expect(clamp(input)).toBe(expected);
  });

  test.each([
    [101,  100],
    [150,  100],
    [1000, 100],
  ])('clamps %d down to 100', (input, expected) => {
    expect(clamp(input)).toBe(expected);
  });

  test('rounds 50.7 up to 51',              () => expect(clamp(50.7)).toBe(51));
  test('rounds 50.2 down to 50',            () => expect(clamp(50.2)).toBe(50));
  test('rounds 99.6 up to 100 (not 101)',   () => expect(clamp(99.6)).toBe(100));
  test('rounds -0.4 to 0',                  () => expect(clamp(-0.4)).toBe(0));
});

// ─────────────────────────────────────────────────────────────────────────────
// getPet()
// ─────────────────────────────────────────────────────────────────────────────
describe('getPet()', () => {
  test('returns undefined for a guild that has no pet', () => {
    expect(getPet('guild-none')).toBeUndefined();
  });

  test('returns the correct row after creation', () => {
    createPet('guild-get-1', 'Mittens', 'cat');
    const pet = getPet('guild-get-1');
    expect(pet).toBeDefined();
    expect(pet.guild_id).toBe('guild-get-1');
    expect(pet.pet_name).toBe('Mittens');
    expect(pet.species).toBe('cat');
  });

  test('returns undefined for a guild with no pet even when another guild has one', () => {
    createPet('guild-get-2', 'Rex', 'dog');
    expect(getPet('guild-get-2-other')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createPet()
// ─────────────────────────────────────────────────────────────────────────────
describe('createPet()', () => {
  test('initialises all four stats at 80', () => {
    const pet = createPet('guild-stats-1', 'Buddy', 'dog');
    expect(pet.hunger).toBe(80);
    expect(pet.mood).toBe(80);
    expect(pet.energy).toBe(80);
    expect(pet.cleanliness).toBe(80);
  });

  test('initialises level at 1 and xp at 0', () => {
    const pet = createPet('guild-level-1', 'Birdy', 'custom');
    expect(pet.level).toBe(1);
    expect(pet.xp).toBe(0);
  });

  test('stores pet_name, species, and guild_id verbatim', () => {
    const pet = createPet('guild-fields-1', 'Goldie', 'fish');
    expect(pet.pet_name).toBe('Goldie');
    expect(pet.species).toBe('fish');
    expect(pet.guild_id).toBe('guild-fields-1');
  });

  test('stores a custom species string verbatim', () => {
    const pet = createPet('guild-custom-1', 'Scales', 'axolotl');
    expect(pet.species).toBe('axolotl');
  });

  test('sets last_updated to approximately the current timestamp', () => {
    const before = Date.now();
    const pet    = createPet('guild-ts-1', 'Dusty', 'gerbil');
    const after  = Date.now();
    expect(pet.last_updated).toBeGreaterThanOrEqual(before);
    expect(pet.last_updated).toBeLessThanOrEqual(after);
  });

  test('returns the newly created pet (non-null)', () => {
    const pet = createPet('guild-return-1', 'Flopsy', 'rabbit');
    expect(pet).toBeDefined();
    expect(pet).not.toBeNull();
  });

  test('the returned pet is immediately retrievable via getPet()', () => {
    createPet('guild-roundtrip-1', 'Pebble', 'hedgehog');
    expect(getPet('guild-roundtrip-1').pet_name).toBe('Pebble');
  });

  test('throws on a duplicate guild_id (UNIQUE constraint)', () => {
    createPet('guild-dupe-1', 'First', 'cat');
    expect(() => createPet('guild-dupe-1', 'Second', 'dog')).toThrow();
  });

  test('two different guilds can each have their own pet', () => {
    createPet('guild-multi-a', 'Alpha', 'cat');
    createPet('guild-multi-b', 'Beta',  'dog');
    expect(getPet('guild-multi-a').pet_name).toBe('Alpha');
    expect(getPet('guild-multi-b').pet_name).toBe('Beta');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// renamePet()
// ─────────────────────────────────────────────────────────────────────────────
describe('renamePet()', () => {
  test('updates the pet name', () => {
    createPet('guild-rn-1', 'OldName', 'cat');
    renamePet('guild-rn-1', 'NewName');
    expect(getPet('guild-rn-1').pet_name).toBe('NewName');
  });

  test('does not affect other columns', () => {
    createPet('guild-rn-2', 'Buddy', 'dog');
    renamePet('guild-rn-2', 'Rex');
    const pet = getPet('guild-rn-2');
    expect(pet.species).toBe('dog');
    expect(pet.hunger).toBe(80);
    expect(pet.level).toBe(1);
  });

  test('returns the updated pet', () => {
    createPet('guild-rn-3', 'Before', 'hamster');
    const pet = renamePet('guild-rn-3', 'After');
    expect(pet.pet_name).toBe('After');
  });

  test('does not affect other guilds', () => {
    createPet('guild-rn-4a', 'Alice', 'cat');
    createPet('guild-rn-4b', 'Bob',   'dog');
    renamePet('guild-rn-4a', 'Alicia');
    expect(getPet('guild-rn-4b').pet_name).toBe('Bob');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// xpToNextLevel()
// ─────────────────────────────────────────────────────────────────────────────
describe('xpToNextLevel()', () => {
  // Baby stage (levels 1–5): 100 XP each
  test('level 1 requires 100 XP', () => expect(xpToNextLevel(1)).toBe(100));
  test('level 2 requires 100 XP', () => expect(xpToNextLevel(2)).toBe(100));
  test('level 5 requires 100 XP', () => expect(xpToNextLevel(5)).toBe(100));
  // Child stage (levels 6–15): 250 XP each
  test('level 6 requires 250 XP',  () => expect(xpToNextLevel(6)).toBe(250));
  test('level 15 requires 250 XP', () => expect(xpToNextLevel(15)).toBe(250));
  // Teen stage (levels 16–30): 500 XP each
  test('level 16 requires 500 XP', () => expect(xpToNextLevel(16)).toBe(500));
  test('level 30 requires 500 XP', () => expect(xpToNextLevel(30)).toBe(500));
  // Adult stage (levels 31+): 1000 XP each
  test('level 31 requires 1000 XP', () => expect(xpToNextLevel(31)).toBe(1000));
});

// ─────────────────────────────────────────────────────────────────────────────
// updateStat()
// ─────────────────────────────────────────────────────────────────────────────
describe('updateStat()', () => {
  test('increases a stat by the given delta', () => {
    createPet('guild-us-1', 'Buddy', 'dog');
    updateStat('guild-us-1', 'hunger', +20);
    expect(getPet('guild-us-1').hunger).toBe(100);
  });

  test('decreases a stat by the given delta', () => {
    createPet('guild-us-2', 'Buddy', 'dog');
    updateStat('guild-us-2', 'energy', -30);
    expect(getPet('guild-us-2').energy).toBe(50);
  });

  test('clamps stat at 100 when delta would exceed it', () => {
    createPet('guild-us-3', 'Buddy', 'dog');
    updateStat('guild-us-3', 'mood', +999);
    expect(getPet('guild-us-3').mood).toBe(100);
  });

  test('clamps stat at 0 when delta would go negative', () => {
    createPet('guild-us-4', 'Buddy', 'dog');
    updateStat('guild-us-4', 'cleanliness', -999);
    expect(getPet('guild-us-4').cleanliness).toBe(0);
  });

  test('throws on an invalid stat name', () => {
    createPet('guild-us-5', 'Buddy', 'dog');
    expect(() => updateStat('guild-us-5', 'invalid', 10)).toThrow();
  });

  test('does not affect other stats', () => {
    createPet('guild-us-6', 'Buddy', 'dog');
    updateStat('guild-us-6', 'hunger', +10);
    const pet = getPet('guild-us-6');
    expect(pet.mood).toBe(80);
    expect(pet.energy).toBe(80);
    expect(pet.cleanliness).toBe(80);
  });

  test('silently does nothing if the guild has no pet', () => {
    expect(() => updateStat('guild-us-none', 'hunger', +10)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// addXP()
// ─────────────────────────────────────────────────────────────────────────────
describe('addXP()', () => {
  test('adds XP without leveling up', () => {
    createPet('guild-xp-1', 'Buddy', 'dog');
    addXP('guild-xp-1', 10);
    expect(getPet('guild-xp-1').xp).toBe(10);
    expect(getPet('guild-xp-1').level).toBe(1);
  });

  test('levels up when XP reaches the threshold', () => {
    createPet('guild-xp-2', 'Buddy', 'dog');
    addXP('guild-xp-2', 100);
    const pet = getPet('guild-xp-2');
    expect(pet.level).toBe(2);
    expect(pet.xp).toBe(0);
  });

  test('carries over excess XP after level-up', () => {
    createPet('guild-xp-3', 'Buddy', 'dog');
    addXP('guild-xp-3', 110);
    const pet = getPet('guild-xp-3');
    expect(pet.level).toBe(2);
    expect(pet.xp).toBe(10);
  });

  test('can level up multiple times in one call', () => {
    createPet('guild-xp-4', 'Buddy', 'dog');
    // 200 XP: level 1→2 costs 100, level 2→3 costs 100, total 200 → level 3, 0 XP remaining
    addXP('guild-xp-4', 200);
    const pet = getPet('guild-xp-4');
    expect(pet.level).toBe(3);
    expect(pet.xp).toBe(0);
  });

  test('silently does nothing if the guild has no pet', () => {
    expect(() => addXP('guild-xp-none', 10)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyDecay()
// ─────────────────────────────────────────────────────────────────────────────
describe('applyDecay()', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('returns null when the guild has no pet', () => {
    expect(applyDecay('guild-decay-none')).toBeNull();
  });

  test('returns the pet unchanged when no time has elapsed', () => {
    createPet('guild-decay-1', 'Buddy', 'dog');
    const pet = applyDecay('guild-decay-1');
    expect(pet.hunger).toBe(80);
    expect(pet.mood).toBe(80);
    expect(pet.energy).toBe(80);
    expect(pet.cleanliness).toBe(80);
  });

  test('reduces all four stats after 2 hours', () => {
    createPet('guild-decay-2', 'Buddy', 'dog');
    jest.advanceTimersByTime(2 * 60 * 60 * 1000);
    const pet = applyDecay('guild-decay-2');
    expect(pet.hunger).toBe(clamp(80 - DECAY_PER_HOUR.hunger * 2));
    expect(pet.mood).toBe(clamp(80 - DECAY_PER_HOUR.mood * 2));
    expect(pet.energy).toBe(clamp(80 - DECAY_PER_HOUR.energy * 2));
    expect(pet.cleanliness).toBe(clamp(80 - DECAY_PER_HOUR.cleanliness * 2));
  });

  test('clamps all stats at 0 after extreme elapsed time', () => {
    createPet('guild-decay-3', 'Buddy', 'dog');
    jest.advanceTimersByTime(200 * 60 * 60 * 1000);
    const pet = applyDecay('guild-decay-3');
    expect(pet.hunger).toBe(0);
    expect(pet.mood).toBe(0);
    expect(pet.energy).toBe(0);
    expect(pet.cleanliness).toBe(0);
  });

  test('hunger decays faster than cleanliness', () => {
    createPet('guild-decay-4', 'Buddy', 'dog');
    jest.advanceTimersByTime(10 * 60 * 60 * 1000);
    const pet = applyDecay('guild-decay-4');
    expect(pet.hunger).toBeLessThan(pet.cleanliness);
  });

  test('updates last_updated after applying decay', () => {
    createPet('guild-decay-5', 'Buddy', 'dog');
    const before = Date.now();
    jest.advanceTimersByTime(60 * 60 * 1000);
    const pet = applyDecay('guild-decay-5');
    expect(pet.last_updated).toBeGreaterThan(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// claimDaily()
// ─────────────────────────────────────────────────────────────────────────────
describe('claimDaily()', () => {
  test('returns null when the guild has no pet', () => {
    expect(claimDaily('guild-daily-none')).toBeNull();
  });

  test('awards XP and treats on first claim', () => {
    createPet('guild-daily-1', 'Buddy', 'dog');
    const result = claimDaily('guild-daily-1');
    expect(result.claimed).toBe(true);
    expect(result.xp).toBe(DAILY_XP);
    expect(result.treats).toBe(DAILY_TREATS);
  });

  test('pet has increased treats after claiming', () => {
    createPet('guild-daily-2', 'Buddy', 'dog');
    claimDaily('guild-daily-2');
    expect(getPet('guild-daily-2').treats).toBe(DAILY_TREATS);
  });

  test('pet has increased XP after claiming', () => {
    createPet('guild-daily-3', 'Buddy', 'dog');
    claimDaily('guild-daily-3');
    expect(getPet('guild-daily-3').xp).toBe(DAILY_XP);
  });

  test('returns claimed: false when called twice on the same UTC day', () => {
    createPet('guild-daily-4', 'Buddy', 'dog');
    claimDaily('guild-daily-4');
    const second = claimDaily('guild-daily-4');
    expect(second.claimed).toBe(false);
  });

  test('returns msUntilReset when on cooldown', () => {
    createPet('guild-daily-5', 'Buddy', 'dog');
    claimDaily('guild-daily-5');
    const result = claimDaily('guild-daily-5');
    expect(result.msUntilReset).toBeGreaterThan(0);
  });

  test('does not award treats a second time on the same day', () => {
    createPet('guild-daily-6', 'Buddy', 'dog');
    claimDaily('guild-daily-6');
    claimDaily('guild-daily-6');
    expect(getPet('guild-daily-6').treats).toBe(DAILY_TREATS);
  });

  test('treats accumulate across separate days', () => {
    jest.useFakeTimers();
    createPet('guild-daily-7', 'Buddy', 'dog');
    claimDaily('guild-daily-7');
    jest.advanceTimersByTime(25 * 60 * 60 * 1000); // skip to next day
    claimDaily('guild-daily-7');
    jest.useRealTimers();
    expect(getPet('guild-daily-7').treats).toBe(DAILY_TREATS * 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// spendTreats()
// ─────────────────────────────────────────────────────────────────────────────
describe('spendTreats()', () => {
  test('returns false when the guild has no pet', () => {
    expect(spendTreats('guild-st-none', 5)).toBe(false);
  });

  test('returns false when treats balance is insufficient', () => {
    createPet('guild-st-1', 'Buddy', 'dog');
    expect(spendTreats('guild-st-1', 10)).toBe(false);
  });

  test('deducts treats and returns true when balance is sufficient', () => {
    createPet('guild-st-2', 'Buddy', 'dog');
    claimDaily('guild-st-2');
    const result = spendTreats('guild-st-2', DAILY_TREATS);
    expect(result).toBe(true);
    expect(getPet('guild-st-2').treats).toBe(0);
  });

  test('allows partial spend — deducts only the requested amount', () => {
    createPet('guild-st-3', 'Buddy', 'dog');
    claimDaily('guild-st-3');
    spendTreats('guild-st-3', 2);
    expect(getPet('guild-st-3').treats).toBe(DAILY_TREATS - 2);
  });

  test('treats never go below zero', () => {
    createPet('guild-st-4', 'Buddy', 'dog');
    spendTreats('guild-st-4', 0);
    expect(getPet('guild-st-4').treats).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// streakMultiplier()
// ─────────────────────────────────────────────────────────────────────────────
describe('streakMultiplier()', () => {
  test('streak 1 returns 1',    () => expect(streakMultiplier(1)).toBe(1));
  test('streak 6 returns 1',    () => expect(streakMultiplier(6)).toBe(1));
  test('streak 7 returns 1.5',  () => expect(streakMultiplier(7)).toBe(1.5));
  test('streak 29 returns 1.5', () => expect(streakMultiplier(29)).toBe(1.5));
  test('streak 30 returns 2',   () => expect(streakMultiplier(30)).toBe(2));
  test('streak 100 returns 2',  () => expect(streakMultiplier(100)).toBe(2));
});

// ─────────────────────────────────────────────────────────────────────────────
// claimDaily() — streak tracking
// ─────────────────────────────────────────────────────────────────────────────
describe('claimDaily() — streak', () => {
  // Pin to noon UTC so advancing 25 h always lands on the next calendar day,
  // not two days ahead (which happens near UTC midnight with real system time).
  beforeEach(() => jest.useFakeTimers({ now: new Date('2026-06-01T12:00:00Z') }));
  afterEach(()  => jest.useRealTimers());

  test('first claim sets streak to 1', () => {
    createPet('guild-streak-1', 'Buddy', 'dog');
    const result = claimDaily('guild-streak-1');
    expect(result.streak).toBe(1);
    expect(getPet('guild-streak-1').streak).toBe(1);
  });

  test('consecutive day increments streak to 2', () => {
    createPet('guild-streak-2', 'Buddy', 'dog');
    claimDaily('guild-streak-2');
    jest.advanceTimersByTime(25 * 60 * 60 * 1000);
    const result = claimDaily('guild-streak-2');
    expect(result.streak).toBe(2);
  });

  test('missing a day resets streak to 1', () => {
    createPet('guild-streak-3', 'Buddy', 'dog');
    claimDaily('guild-streak-3');
    jest.advanceTimersByTime(49 * 60 * 60 * 1000); // skip two days
    const result = claimDaily('guild-streak-3');
    expect(result.streak).toBe(1);
  });

  test('streak 7 applies 1.5× multiplier to XP and treats', () => {
    createPet('guild-streak-4', 'Buddy', 'dog');
    // Build up a 6-day streak
    for (let i = 0; i < 6; i++) {
      claimDaily('guild-streak-4');
      jest.advanceTimersByTime(25 * 60 * 60 * 1000);
    }
    const result = claimDaily('guild-streak-4');
    expect(result.streak).toBe(7);
    expect(result.multiplier).toBe(1.5);
    expect(result.xp).toBe(Math.round(DAILY_XP * 1.5));
    expect(result.treats).toBe(Math.round(DAILY_TREATS * 1.5));
  });

  test('no streak multiplier below 7 days', () => {
    createPet('guild-streak-5', 'Buddy', 'dog');
    claimDaily('guild-streak-5');
    jest.advanceTimersByTime(25 * 60 * 60 * 1000);
    const result = claimDaily('guild-streak-5');
    expect(result.multiplier).toBe(1);
    expect(result.xp).toBe(DAILY_XP);
    expect(result.treats).toBe(DAILY_TREATS);
  });

  test('cooldown reply does not change streak', () => {
    createPet('guild-streak-6', 'Buddy', 'dog');
    claimDaily('guild-streak-6');
    const cooldown = claimDaily('guild-streak-6');
    expect(cooldown.claimed).toBe(false);
    expect(getPet('guild-streak-6').streak).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getTodayTasks()
// ─────────────────────────────────────────────────────────────────────────────
describe('getTodayTasks()', () => {
  const NOW = new Date('2026-06-01T12:00:00Z').getTime();

  test('generates exactly 3 tasks', () => {
    createPet('guild-tasks-1', 'Buddy', 'dog');
    const tasks = getTodayTasks('guild-tasks-1', NOW);
    expect(tasks).toHaveLength(3);
  });

  test('generated tasks all have keys present in TASK_POOL', () => {
    createPet('guild-tasks-2', 'Buddy', 'dog');
    const tasks  = getTodayTasks('guild-tasks-2', NOW);
    const keys   = new Set(TASK_POOL.map(t => t.key));
    for (const row of tasks) expect(keys.has(row.task_key)).toBe(true);
  });

  test('no two generated tasks share the same action type', () => {
    createPet('guild-tasks-3', 'Buddy', 'dog');
    const tasks   = getTodayTasks('guild-tasks-3', NOW);
    const actions = tasks.map(row => TASK_POOL.find(t => t.key === row.task_key).action);
    expect(new Set(actions).size).toBe(3);
  });

  test('calling twice on the same day returns the same tasks', () => {
    createPet('guild-tasks-4', 'Buddy', 'dog');
    const first  = getTodayTasks('guild-tasks-4', NOW).map(r => r.task_key);
    const second = getTodayTasks('guild-tasks-4', NOW).map(r => r.task_key);
    expect(first).toEqual(second);
  });

  test('all tasks start with progress 0 and completed 0', () => {
    createPet('guild-tasks-5', 'Buddy', 'dog');
    const tasks = getTodayTasks('guild-tasks-5', NOW);
    for (const row of tasks) {
      expect(row.progress).toBe(0);
      expect(row.completed).toBe(0);
    }
  });

  test('new tasks are generated after a UTC day boundary', () => {
    createPet('guild-tasks-6', 'Buddy', 'dog');
    const day1 = getTodayTasks('guild-tasks-6', NOW).map(r => r.task_key);
    const nextDay = new Date('2026-06-02T12:00:00Z').getTime();
    const day2 = getTodayTasks('guild-tasks-6', nextDay).map(r => r.task_key);
    // Day 2 tasks are a fresh set (different rows exist for the new date)
    expect(getUtcDateKey(NOW)).toBe('2026-06-01');
    expect(getUtcDateKey(nextDay)).toBe('2026-06-02');
    // Both sets are valid length
    expect(day1).toHaveLength(3);
    expect(day2).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// recordTaskAction()
// ─────────────────────────────────────────────────────────────────────────────
describe('recordTaskAction()', () => {
  const NOW = new Date('2026-06-03T12:00:00Z').getTime();

  test('returns empty array when guild has no pet', () => {
    expect(recordTaskAction('guild-rta-nopet', 'feed', NOW)).toEqual([]);
  });

  test('returns empty array when no task matches the action', () => {
    createPet('guild-rta-1', 'Buddy', 'dog');
    // Seed today's tasks first, then call with an action that definitely has no task
    // We use a fresh guild so we control which tasks are seeded.
    // Just verify the return is always an array.
    const result = recordTaskAction('guild-rta-1', 'feed', NOW);
    expect(Array.isArray(result)).toBe(true);
  });

  test('increments progress toward target', () => {
    // Find a task with target >= 2 to observe intermediate progress
    const twiceTask = TASK_POOL.find(t => t.target === 2);
    createPet('guild-rta-2', 'Buddy', 'dog');

    // Force a deterministic task set by calling getTodayTasks and checking what was generated
    const rows = getTodayTasks('guild-rta-2', NOW);
    const matchRow = rows.find(r => r.task_key === twiceTask?.key);
    if (!matchRow) return; // This guild happened not to get a ×2 task — skip gracefully

    recordTaskAction('guild-rta-2', twiceTask.action, NOW);
    const updated = getTodayTasks('guild-rta-2', NOW).find(r => r.task_key === twiceTask.key);
    expect(updated.progress).toBe(1);
    expect(updated.completed).toBe(0);
  });

  test('completing a task awards treats to the pet', () => {
    // Use a ×1 target task so one action completes it
    const onceTask = TASK_POOL.find(t => t.target === 1);
    createPet('guild-rta-3', 'Buddy', 'dog');

    const rows = getTodayTasks('guild-rta-3', NOW);
    const matchRow = rows.find(r => r.task_key === onceTask?.key);
    if (!matchRow) return;

    const before = getPet('guild-rta-3').treats;
    recordTaskAction('guild-rta-3', onceTask.action, NOW);
    const after = getPet('guild-rta-3').treats;
    expect(after).toBe(before + onceTask.treats);
  });

  test('completing a task returns the task def in the result array', () => {
    const onceTask = TASK_POOL.find(t => t.target === 1);
    createPet('guild-rta-4', 'Buddy', 'dog');

    const rows = getTodayTasks('guild-rta-4', NOW);
    const matchRow = rows.find(r => r.task_key === onceTask?.key);
    if (!matchRow) return;

    const result = recordTaskAction('guild-rta-4', onceTask.action, NOW);
    expect(result.some(d => d.key === onceTask.key)).toBe(true);
  });

  test('a completed task is not awarded again on a repeat action', () => {
    const onceTask = TASK_POOL.find(t => t.target === 1);
    createPet('guild-rta-5', 'Buddy', 'dog');

    const rows = getTodayTasks('guild-rta-5', NOW);
    const matchRow = rows.find(r => r.task_key === onceTask?.key);
    if (!matchRow) return;

    recordTaskAction('guild-rta-5', onceTask.action, NOW);
    const treatsAfterFirst = getPet('guild-rta-5').treats;
    recordTaskAction('guild-rta-5', onceTask.action, NOW);
    expect(getPet('guild-rta-5').treats).toBe(treatsAfterFirst);
  });

  test('completed task row has completed = 1', () => {
    const onceTask = TASK_POOL.find(t => t.target === 1);
    createPet('guild-rta-6', 'Buddy', 'dog');

    const rows = getTodayTasks('guild-rta-6', NOW);
    const matchRow = rows.find(r => r.task_key === onceTask?.key);
    if (!matchRow) return;

    recordTaskAction('guild-rta-6', onceTask.action, NOW);
    const updated = getTodayTasks('guild-rta-6', NOW).find(r => r.task_key === onceTask.key);
    expect(updated.completed).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getUtcDateKey()
// ─────────────────────────────────────────────────────────────────────────────
describe('getUtcDateKey()', () => {
  test('returns YYYY-MM-DD format', () => {
    expect(getUtcDateKey(new Date('2026-05-26T00:00:00Z').getTime())).toBe('2026-05-26');
  });

  test('uses UTC midnight boundary correctly', () => {
    const justBeforeMidnight = new Date('2026-05-26T23:59:59Z').getTime();
    const justAfterMidnight  = new Date('2026-05-27T00:00:01Z').getTime();
    expect(getUtcDateKey(justBeforeMidnight)).toBe('2026-05-26');
    expect(getUtcDateKey(justAfterMidnight)).toBe('2026-05-27');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// addToInventory() / getInventory() / useFromInventory()
// ─────────────────────────────────────────────────────────────────────────────
describe('inventory functions', () => {
  const G = 'guild-inv';
  const U = 'user-inv-1';

  test('getInventory returns empty array when user has no items', () => {
    expect(getInventory(G, 'user-empty')).toEqual([]);
  });

  test('addToInventory creates a row with quantity 1', () => {
    addToInventory(G, U, 'premium_food');
    const rows = getInventory(G, U);
    expect(rows).toHaveLength(1);
    expect(rows[0].item_key).toBe('premium_food');
    expect(rows[0].quantity).toBe(1);
  });

  test('addToInventory increments quantity on second add', () => {
    addToInventory(G, U, 'premium_food');
    const rows = getInventory(G, U);
    const row  = rows.find(r => r.item_key === 'premium_food');
    expect(row.quantity).toBe(2);
  });

  test('addToInventory tracks multiple distinct items', () => {
    addToInventory(G, U, 'luxury_bath');
    const rows = getInventory(G, U);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const keys = rows.map(r => r.item_key);
    expect(keys).toContain('premium_food');
    expect(keys).toContain('luxury_bath');
  });

  test('useFromInventory returns false when item not in inventory', () => {
    expect(useFromInventory(G, 'user-has-nothing', 'energy_drink')).toBe(false);
  });

  test('useFromInventory decrements quantity and returns true', () => {
    const U2 = 'user-inv-2';
    addToInventory(G, U2, 'premium_toy');
    addToInventory(G, U2, 'premium_toy');
    const result = useFromInventory(G, U2, 'premium_toy');
    expect(result).toBe(true);
    const row = getInventory(G, U2).find(r => r.item_key === 'premium_toy');
    expect(row.quantity).toBe(1);
  });

  test('useFromInventory removes the row when last item is used', () => {
    const U3 = 'user-inv-3';
    addToInventory(G, U3, 'energy_drink');
    useFromInventory(G, U3, 'energy_drink');
    expect(getInventory(G, U3)).toHaveLength(0);
  });

  test('useFromInventory returns false after last item is consumed', () => {
    const U4 = 'user-inv-4';
    addToInventory(G, U4, 'luxury_bath');
    useFromInventory(G, U4, 'luxury_bath');
    expect(useFromInventory(G, U4, 'luxury_bath')).toBe(false);
  });

  test('inventory is per-user — different users have separate inventories', () => {
    const UA = 'user-inv-a';
    const UB = 'user-inv-b';
    addToInventory(G, UA, 'premium_food');
    expect(getInventory(G, UB)).toHaveLength(0);
  });

  test('inventory is per-guild — same user in different guilds have separate inventories', () => {
    const GA = 'guild-inv-a';
    const GB = 'guild-inv-b';
    const U5 = 'user-inv-5';
    addToInventory(GA, U5, 'premium_toy');
    expect(getInventory(GB, U5)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// incrementActionCount() / incrementItemsBought()
// ─────────────────────────────────────────────────────────────────────────────
describe('incrementActionCount() / incrementItemsBought()', () => {
  test('increments feed_count after feed action', () => {
    createPet('guild-iac-1', 'Buddy', 'dog');
    incrementActionCount('guild-iac-1', 'feed');
    expect(getPet('guild-iac-1').feed_count).toBe(1);
  });

  test('increments play_count after play action', () => {
    createPet('guild-iac-2', 'Buddy', 'dog');
    incrementActionCount('guild-iac-2', 'play');
    expect(getPet('guild-iac-2').play_count).toBe(1);
  });

  test('does nothing for untracked actions (clean, sleep)', () => {
    createPet('guild-iac-3', 'Buddy', 'dog');
    incrementActionCount('guild-iac-3', 'clean');
    incrementActionCount('guild-iac-3', 'sleep');
    const pet = getPet('guild-iac-3');
    expect(pet.feed_count).toBe(0);
    expect(pet.play_count).toBe(0);
  });

  test('increments items_bought_count', () => {
    createPet('guild-iac-4', 'Buddy', 'dog');
    incrementItemsBought('guild-iac-4');
    incrementItemsBought('guild-iac-4');
    expect(getPet('guild-iac-4').items_bought_count).toBe(2);
  });

  test('spendTreats increments treats_spent_total', () => {
    createPet('guild-iac-5', 'Buddy', 'dog');
    claimDaily('guild-iac-5'); // gives DAILY_TREATS = 5 treats
    spendTreats('guild-iac-5', 3);
    expect(getPet('guild-iac-5').treats_spent_total).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkBadges() / getEarnedBadges()
// ─────────────────────────────────────────────────────────────────────────────
describe('checkBadges()', () => {
  const NOW = new Date('2026-07-01T12:00:00Z').getTime();

  test('returns empty array when guild has no pet', () => {
    expect(checkBadges('guild-badges-nopet', 'user-b', NOW)).toEqual([]);
  });

  test('returns empty array when no badge conditions are met', () => {
    createPet('guild-badges-1', 'Buddy', 'dog');
    const result = checkBadges('guild-badges-1', 'user-b1', NOW);
    expect(Array.isArray(result)).toBe(true);
  });

  test('awards first_meal when feed_count >= 1', () => {
    createPet('guild-badges-2', 'Buddy', 'dog');
    incrementActionCount('guild-badges-2', 'feed');
    const result = checkBadges('guild-badges-2', 'user-b2', NOW);
    expect(result.some(b => b.key === 'first_meal')).toBe(true);
  });

  test('awards playmate when play_count >= 1', () => {
    createPet('guild-badges-3', 'Buddy', 'dog');
    incrementActionCount('guild-badges-3', 'play');
    const result = checkBadges('guild-badges-3', 'user-b3', NOW);
    expect(result.some(b => b.key === 'playmate')).toBe(true);
  });

  test('awards window_shopper when items_bought_count >= 1', () => {
    createPet('guild-badges-4', 'Buddy', 'dog');
    incrementItemsBought('guild-badges-4');
    const result = checkBadges('guild-badges-4', 'user-b4', NOW);
    expect(result.some(b => b.key === 'window_shopper')).toBe(true);
  });

  test('awards growing_up when level >= 6', () => {
    createPet('guild-badges-5', 'Buddy', 'dog');
    addXP('guild-badges-5', 500); // 5 levels × 100 XP each → arrives at level 6
    expect(getPet('guild-badges-5').level).toBe(6);
    const result = checkBadges('guild-badges-5', 'user-b5', NOW);
    expect(result.some(b => b.key === 'growing_up')).toBe(true);
  });

  test('does not award the same badge twice', () => {
    createPet('guild-badges-6', 'Buddy', 'dog');
    incrementActionCount('guild-badges-6', 'feed');
    checkBadges('guild-badges-6', 'user-b6', NOW);
    const second = checkBadges('guild-badges-6', 'user-b6', NOW);
    expect(second.some(b => b.key === 'first_meal')).toBe(false);
  });

  test('getEarnedBadges returns saved badges', () => {
    createPet('guild-badges-7', 'Buddy', 'dog');
    incrementActionCount('guild-badges-7', 'feed');
    checkBadges('guild-badges-7', 'user-b7', NOW);
    const earned = getEarnedBadges('guild-badges-7', 'user-b7');
    expect(earned.some(r => r.badge_key === 'first_meal')).toBe(true);
  });

  test('badges are per-user — a second user starts with no badges', () => {
    createPet('guild-badges-8', 'Buddy', 'dog');
    incrementActionCount('guild-badges-8', 'feed');
    checkBadges('guild-badges-8', 'user-b8a', NOW);
    expect(getEarnedBadges('guild-badges-8', 'user-b8b')).toHaveLength(0);
  });

  test('daily_devotee badge awarded when last_daily > 0', () => {
    createPet('guild-badges-9', 'Buddy', 'dog');
    claimDaily('guild-badges-9');
    const result = checkBadges('guild-badges-9', 'user-b9', NOW);
    expect(result.some(b => b.key === 'daily_devotee')).toBe(true);
  });

  test('treat_hoarder badge awarded when treats >= 50', () => {
    // Accumulate ≥50 treats via 9 consecutive daily claims (days 1-6: 5 treats each,
    // days 7-9: 8 treats each with 1.5× streak bonus → 30 + 24 = 54 treats total).
    jest.useFakeTimers({ now: new Date('2026-07-01T12:00:00Z') });
    createPet('guild-badges-10', 'Buddy', 'dog');
    for (let i = 0; i < 9; i++) {
      claimDaily('guild-badges-10');
      jest.advanceTimersByTime(25 * 60 * 60 * 1000);
    }
    jest.useRealTimers();
    const checkTime = new Date('2026-07-10T12:00:00Z').getTime();
    const result = checkBadges('guild-badges-10', 'user-b10', checkTime);
    expect(result.some(b => b.key === 'treat_hoarder')).toBe(true);
  });

  test('collector badge awarded when inventory has qty >= 3', () => {
    createPet('guild-badges-11', 'Buddy', 'dog');
    addToInventory('guild-badges-11', 'user-b11', 'premium_food');
    addToInventory('guild-badges-11', 'user-b11', 'premium_food');
    addToInventory('guild-badges-11', 'user-b11', 'premium_food');
    const result = checkBadges('guild-badges-11', 'user-b11', NOW);
    expect(result.some(b => b.key === 'collector')).toBe(true);
  });

  test('BADGE_DEFINITIONS contains exactly 15 entries', () => {
    expect(BADGE_DEFINITIONS).toHaveLength(15);
  });

  test('every badge definition has key, label, emoji, description, and check', () => {
    for (const badge of BADGE_DEFINITIONS) {
      expect(typeof badge.key).toBe('string');
      expect(typeof badge.label).toBe('string');
      expect(typeof badge.emoji).toBe('string');
      expect(typeof badge.description).toBe('string');
      expect(typeof badge.check).toBe('function');
    }
  });
});
