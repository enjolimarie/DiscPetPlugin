jest.mock('../../database/db', () => ({
  getPet: jest.fn(), createPet: jest.fn(), clamp: jest.fn(),
}));

const { speciesEmoji } = require('../../commands/pet');

describe('speciesEmoji()', () => {
  describe('built-in species', () => {
    test.each([
      ['cat',         '🐱'],
      ['dog',         '🐶'],
      ['fish',        '🐟'],
      ['chameleon',   '🦎'],
      ['hedgehog',    '🦔'],
      ['hamster',     '🐹'],
      ['mouse',       '🐭'],
      ['gerbil',      '🐀'],
      ['guinea pig',  '🐾'],
      ['rabbit',      '🐰'],
    ])('%s → %s', (species, expected) => {
      expect(speciesEmoji(species)).toBe(expected);
    });
  });

  describe('fallback for unknown species', () => {
    test('returns 🐾 for an unknown species string', () =>
      expect(speciesEmoji('axolotl')).toBe('🐾'));

    test('returns 🐾 for a completely arbitrary string', () =>
      expect(speciesEmoji('dragon')).toBe('🐾'));

    test('returns 🐾 for an empty string', () =>
      expect(speciesEmoji('')).toBe('🐾'));
  });

  describe('case insensitivity', () => {
    test('Cat (title case) → 🐱',   () => expect(speciesEmoji('Cat')).toBe('🐱'));
    test('DOG (upper case) → 🐶',   () => expect(speciesEmoji('DOG')).toBe('🐶'));
    test('HAMSTER → 🐹',            () => expect(speciesEmoji('HAMSTER')).toBe('🐹'));
    test('Guinea Pig (mixed) → 🐾', () => expect(speciesEmoji('Guinea Pig')).toBe('🐾'));
  });
});
