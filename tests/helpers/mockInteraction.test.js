const { buildMockInteraction } = require('./mockInteraction');

describe('buildMockInteraction() — defaults', () => {
  let ix;
  beforeEach(() => { ix = buildMockInteraction(); });

  test('guildId defaults to "guild-123"',      () => expect(ix.guildId).toBe('guild-123'));
  test('commandName defaults to "pet"',         () => expect(ix.commandName).toBe('pet'));
  test('replied defaults to false',             () => expect(ix.replied).toBe(false));
  test('deferred defaults to false',            () => expect(ix.deferred).toBe(false));
  test('isChatInputCommand() returns true',     () => expect(ix.isChatInputCommand()).toBe(true));
  test('getSubcommand() returns "adopt"',       () => expect(ix.options.getSubcommand()).toBe('adopt'));
  test('getString() returns null for unknown option', () =>
    expect(ix.options.getString('unknown')).toBeNull());
  test('reply is a jest mock function',   () => expect(jest.isMockFunction(ix.reply)).toBe(true));
  test('followUp is a jest mock function', () => expect(jest.isMockFunction(ix.followUp)).toBe(true));
});

describe('buildMockInteraction() — custom values', () => {
  test('accepts a custom guildId', () =>
    expect(buildMockInteraction({ guildId: 'my-guild' }).guildId).toBe('my-guild'));

  test('accepts null guildId to simulate a DM', () =>
    expect(buildMockInteraction({ guildId: null }).guildId).toBeNull());

  test('accepts a custom commandName', () =>
    expect(buildMockInteraction({ commandName: 'admin' }).commandName).toBe('admin'));

  test('accepts a custom subcommand', () =>
    expect(buildMockInteraction({ subcommand: 'status' }).options.getSubcommand()).toBe('status'));

  test('getString() returns values from the options map', () => {
    const ix = buildMockInteraction({ options: { name: 'Buddy', species: 'dog' } });
    expect(ix.options.getString('name')).toBe('Buddy');
    expect(ix.options.getString('species')).toBe('dog');
  });

  test('getString() returns null for keys absent from the options map', () => {
    const ix = buildMockInteraction({ options: { name: 'Buddy' } });
    expect(ix.options.getString('species')).toBeNull();
  });

  test('isChatInputCommand() returns false when isChatInput is false', () =>
    expect(buildMockInteraction({ isChatInput: false }).isChatInputCommand()).toBe(false));

  test('sets replied and deferred correctly', () => {
    const ix = buildMockInteraction({ replied: true, deferred: true });
    expect(ix.replied).toBe(true);
    expect(ix.deferred).toBe(true);
  });
});
