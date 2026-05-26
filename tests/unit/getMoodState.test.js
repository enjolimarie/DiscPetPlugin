const { getMoodState } = require('../../commands/pet');

const NOW = Date.now();
const hoursAgo = (h) => NOW - h * 60 * 60 * 1000;

// Healthy pet with a recent interaction — baseline for each test
const BASE = {
  hunger:       70,
  mood:         70,
  energy:       70,
  cleanliness:  70,
  last_updated: hoursAgo(1),
};

describe('getMoodState()', () => {
  // ── Sick ─────────────────────────────────────────────────────────────────
  test('returns Sick when cleanliness < 20', () => {
    expect(getMoodState({ ...BASE, cleanliness: 19 }, NOW).label).toBe('Sick');
  });

  test('Sick boundary: exactly 20 does not trigger Sick', () => {
    expect(getMoodState({ ...BASE, cleanliness: 20 }, NOW).label).not.toBe('Sick');
  });

  // ── Grumpy ───────────────────────────────────────────────────────────────
  test('returns Grumpy when hunger < 20', () => {
    expect(getMoodState({ ...BASE, hunger: 19 }, NOW).label).toBe('Grumpy');
  });

  test('Grumpy boundary: exactly 20 does not trigger Grumpy', () => {
    expect(getMoodState({ ...BASE, hunger: 20 }, NOW).label).not.toBe('Grumpy');
  });

  // ── Sleepy ───────────────────────────────────────────────────────────────
  test('returns Sleepy when energy < 20', () => {
    expect(getMoodState({ ...BASE, energy: 19 }, NOW).label).toBe('Sleepy');
  });

  test('Sleepy boundary: exactly 20 does not trigger Sleepy', () => {
    expect(getMoodState({ ...BASE, energy: 20 }, NOW).label).not.toBe('Sleepy');
  });

  // ── Sad ──────────────────────────────────────────────────────────────────
  test('returns Sad when mood < 30', () => {
    expect(getMoodState({ ...BASE, mood: 29 }, NOW).label).toBe('Sad');
  });

  test('returns Sad when no interaction in over 24 hours', () => {
    expect(getMoodState({ ...BASE, last_updated: hoursAgo(25) }, NOW).label).toBe('Sad');
  });

  test('Sad boundary: exactly 24 hours does not trigger Sad', () => {
    expect(getMoodState({ ...BASE, last_updated: hoursAgo(24) }, NOW).label).not.toBe('Sad');
  });

  // ── Lonely ───────────────────────────────────────────────────────────────
  test('returns Lonely when no interaction in over 8 hours', () => {
    expect(getMoodState({ ...BASE, last_updated: hoursAgo(9) }, NOW).label).toBe('Lonely');
  });

  test('Lonely boundary: exactly 8 hours does not trigger Lonely', () => {
    expect(getMoodState({ ...BASE, last_updated: hoursAgo(8) }, NOW).label).not.toBe('Lonely');
  });

  // ── Bored ────────────────────────────────────────────────────────────────
  test('returns Bored when mood < 50', () => {
    expect(getMoodState({ ...BASE, mood: 49 }, NOW).label).toBe('Bored');
  });

  test('Bored boundary: exactly 50 mood does not trigger Bored', () => {
    expect(getMoodState({ ...BASE, mood: 50 }, NOW).label).not.toBe('Bored');
  });

  // ── Happy ────────────────────────────────────────────────────────────────
  test('returns Happy when mood >= 70, hunger >= 50, energy >= 50', () => {
    expect(getMoodState({ ...BASE, mood: 70, hunger: 50, energy: 50 }, NOW).label).toBe('Happy');
  });

  test('Happy requires all three conditions — low hunger prevents it', () => {
    expect(getMoodState({ ...BASE, mood: 70, hunger: 49, energy: 70 }, NOW).label).not.toBe('Happy');
  });

  test('Happy requires all three conditions — low energy prevents it', () => {
    expect(getMoodState({ ...BASE, mood: 70, hunger: 70, energy: 49 }, NOW).label).not.toBe('Happy');
  });

  // ── Content ──────────────────────────────────────────────────────────────
  test('returns Content as the default when no other condition matches', () => {
    const pet = { ...BASE, mood: 55, hunger: 55, energy: 55, cleanliness: 55 };
    expect(getMoodState(pet, NOW).label).toBe('Content');
  });

  // ── Priority ─────────────────────────────────────────────────────────────
  test('Sick takes priority over Grumpy when both conditions are met', () => {
    expect(getMoodState({ ...BASE, cleanliness: 10, hunger: 10 }, NOW).label).toBe('Sick');
  });

  test('Grumpy takes priority over Sleepy', () => {
    expect(getMoodState({ ...BASE, hunger: 10, energy: 10 }, NOW).label).toBe('Grumpy');
  });

  test('Sleepy takes priority over Sad', () => {
    expect(getMoodState({ ...BASE, energy: 10, mood: 20 }, NOW).label).toBe('Sleepy');
  });

  // ── Emoji ────────────────────────────────────────────────────────────────
  test.each([
    [{ ...BASE, cleanliness: 10 },                    'Sick',    '🤢'],
    [{ ...BASE, hunger:      10 },                    'Grumpy',  '😠'],
    [{ ...BASE, energy:      10 },                    'Sleepy',  '😴'],
    [{ ...BASE, mood:        20 },                    'Sad',     '😢'],
    [{ ...BASE, last_updated: hoursAgo(9) },          'Lonely',  '🥺'],
    [{ ...BASE, mood:        40 },                    'Bored',   '😐'],
    [{ ...BASE },                                     'Happy',   '😊'],
    [{ ...BASE, mood: 55, hunger: 55, energy: 55 },   'Content', '😌'],
  ])('correct emoji for %s', (pet, expectedLabel, expectedEmoji) => {
    const result = getMoodState(pet, NOW);
    expect(result.label).toBe(expectedLabel);
    expect(result.emoji).toBe(expectedEmoji);
  });
});
