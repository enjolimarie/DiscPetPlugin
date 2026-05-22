jest.mock('../../database/db', () => ({
  getPet: jest.fn(), createPet: jest.fn(), clamp: jest.fn(),
}));

const { statBar } = require('../../commands/pet');

describe('statBar()', () => {
  test('renders a full bar at 100',  () => expect(statBar(100)).toBe('██████████ 100/100'));
  test('renders an empty bar at 0',  () => expect(statBar(0)).toBe('░░░░░░░░░░ 0/100'));
  test('renders a half bar at 50',   () => expect(statBar(50)).toBe('█████░░░░░ 50/100'));
  test('renders 80% bar (default starting stat)', () => expect(statBar(80)).toBe('████████░░ 80/100'));

  test('rounds 45 to 5 filled blocks (Math.round(45/10) = 5)', () =>
    expect(statBar(45)).toBe('█████░░░░░ 45/100'));

  test('rounds 55 to 6 filled blocks (Math.round(55/10) = 6)', () =>
    expect(statBar(55)).toBe('██████░░░░ 55/100'));

  // ── Regression: Issue 003 ─────────────────────────────────────────────────
  // '░'.repeat(10 - filled) throws RangeError: Invalid count value when filled > 10.
  // This test is expected to fail until the fix from Issue 003 is applied.
  test.failing('does not throw RangeError when value exceeds 100 (Issue 003)', () => {
    expect(() => statBar(110)).not.toThrow();
  });

  // ── Regression: Issue 006 ─────────────────────────────────────────────────
  // statBar(null) renders "null/100" instead of treating null as 0.
  // This test is expected to fail until the fix from Issue 006 is applied.
  test.failing('treats null as 0 rather than rendering "null/100" (Issue 006)', () => {
    expect(statBar(null)).toBe('░░░░░░░░░░ 0/100');
  });
});
