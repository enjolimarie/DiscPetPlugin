// Use an in-memory SQLite database so tests never touch pets.db on disk.
// Must be set before the module is first required.
process.env.TEST_DB_PATH = ':memory:';

const { getPet, createPet, deletePet, renamePet, updateStat, addXP, xpToNextLevel, applyDecay, DECAY_PER_HOUR, claimDaily, DAILY_XP, DAILY_TREATS, clamp } = require('../../database/db');

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
  test('level 1 requires 100 XP', () => expect(xpToNextLevel(1)).toBe(100));
  test('level 2 requires 200 XP', () => expect(xpToNextLevel(2)).toBe(200));
  test('level 5 requires 500 XP', () => expect(xpToNextLevel(5)).toBe(500));
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
    addXP('guild-xp-4', 300);
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
