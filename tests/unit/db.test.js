// Use an in-memory SQLite database so tests never touch pets.db on disk.
// Must be set before the module is first required.
process.env.TEST_DB_PATH = ':memory:';

const { getPet, createPet, deletePet, clamp } = require('../../database/db');

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
