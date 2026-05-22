/**
 * Builds a minimal mock of a discord.js ChatInputCommandInteraction.
 *
 * @param {object}      opts
 * @param {string|null} opts.guildId      - null simulates a DM
 * @param {string}      opts.commandName  - slash command name sent to the dispatcher
 * @param {string}      opts.subcommand   - value returned by getSubcommand()
 * @param {object}      opts.options      - map of option name → value for getString()
 * @param {boolean}     opts.isChatInput  - false simulates a non-slash interaction
 * @param {boolean}     opts.replied      - simulate an already-replied interaction
 * @param {boolean}     opts.deferred     - simulate a deferred-reply interaction
 */
function buildMockInteraction({
  guildId     = 'guild-123',
  commandName = 'pet',
  subcommand  = 'adopt',
  options     = {},
  isChatInput = true,
  replied     = false,
  deferred    = false,
} = {}) {
  return {
    guildId,
    commandName,
    replied,
    deferred,
    isChatInputCommand: jest.fn().mockReturnValue(isChatInput),
    options: {
      getSubcommand: jest.fn().mockReturnValue(subcommand),
      getString:     jest.fn((name) => options[name] ?? null),
    },
    reply:    jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  };
}

module.exports = { buildMockInteraction };
