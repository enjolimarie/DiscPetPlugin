/**
 * Integration tests for the command-loading and dispatch pipeline defined in index.js.
 *
 * Rather than importing index.js directly (which immediately calls client.login()),
 * this file replicates the two responsibilities of index.js that are worth testing:
 *
 *   1. Command auto-loading  — reading *.js files from commands/ and registering
 *                              those with a valid { data, execute } shape.
 *   2. Interaction dispatch  — routing an incoming interaction to the right command,
 *                              handling unknown commands, non-slash interactions,
 *                              and errors thrown inside execute().
 *
 * If either responsibility changes in index.js, the matching test group below will
 * need to be updated, which is the intended signal.
 */

jest.mock('../../database/db', () => ({
  getPet:    jest.fn(),
  createPet: jest.fn(),
  clamp:     jest.fn((v) => Math.max(0, Math.min(100, Math.round(v)))),
}));

const { Collection } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const { getPet, createPet } = require('../../database/db');
const { buildMockInteraction } = require('../helpers/mockInteraction');

// ── Replicate the command-loading logic from index.js ────────────────────────
const commands     = new Collection();
const commandsPath = path.join(__dirname, '../../commands');

for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    commands.set(command.data.name, command);
  }
}

// ── Replicate the interactionCreate handler from index.js ────────────────────
async function dispatch(cmds, interaction) {
  if (!interaction.isChatInputCommand()) return;
  const command = cmds.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    const payload = { content: 'Something went wrong while running that command.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  }
}

const HEALTHY_PET = {
  guild_id: 'guild-123', pet_name: 'Sparky', species: 'dog',
  hunger: 80, mood: 80, energy: 80, cleanliness: 80,
  level: 1, xp: 0, last_updated: Date.now(),
};

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// 1. Command auto-loading
// ─────────────────────────────────────────────────────────────────────────────
describe('command loading', () => {
  test('registers the pet command', () => {
    expect(commands.has('pet')).toBe(true);
  });

  test("pet command's data.name matches its key in the collection", () => {
    expect(commands.get('pet').data.name).toBe('pet');
  });

  test('pet command exports an execute function', () => {
    expect(typeof commands.get('pet').execute).toBe('function');
  });

  test('only registers commands that have both data and execute', () => {
    // Every entry in the collection must satisfy the guard from index.js
    for (const [, cmd] of commands) {
      expect(cmd.data).toBeDefined();
      expect(typeof cmd.execute).toBe('function');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Interaction dispatch
// ─────────────────────────────────────────────────────────────────────────────
describe('interaction dispatch', () => {
  test('routes a /pet adopt interaction and produces a reply', async () => {
    getPet.mockReturnValue(undefined);
    createPet.mockReturnValue(HEALTHY_PET);

    const ix = buildMockInteraction({ commandName: 'pet', subcommand: 'adopt',
      options: { name: 'Sparky', species: 'dog' } });

    await dispatch(commands, ix);

    expect(ix.reply).toHaveBeenCalled();
  });

  test('routes a /pet status interaction and produces a reply', async () => {
    getPet.mockReturnValue(HEALTHY_PET);

    const ix = buildMockInteraction({ commandName: 'pet', subcommand: 'status' });
    await dispatch(commands, ix);

    expect(ix.reply).toHaveBeenCalled();
  });

  test('does nothing for a non-chat-input interaction', async () => {
    const ix = buildMockInteraction({ isChatInput: false });
    await dispatch(commands, ix);
    expect(ix.reply).not.toHaveBeenCalled();
  });

  test('does nothing for an unrecognised command name', async () => {
    const ix = buildMockInteraction({ commandName: 'nonexistent' });
    await dispatch(commands, ix);
    expect(ix.reply).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Error handling inside the dispatcher
// ─────────────────────────────────────────────────────────────────────────────
describe('dispatcher error handling', () => {
  // Use a minimal fake command to isolate the error-recovery path
  const crashCommand = {
    data:    { name: 'crash' },
    execute: jest.fn().mockRejectedValue(new Error('test error')),
  };
  const crashSet = new Collection([['crash', crashCommand]]);

  beforeEach(() => crashCommand.execute.mockRejectedValue(new Error('test error')));

  test('replies with an ephemeral error message when execute() throws', async () => {
    const ix = buildMockInteraction({ commandName: 'crash' });
    await dispatch(crashSet, ix);

    expect(ix.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        ephemeral: true,
        content:   expect.stringContaining('Something went wrong'),
      }),
    );
  });

  test('uses followUp (not reply) when the interaction is already replied', async () => {
    const ix = buildMockInteraction({ commandName: 'crash', replied: true });
    await dispatch(crashSet, ix);

    expect(ix.followUp).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(ix.reply).not.toHaveBeenCalled();
  });

  test('uses followUp (not reply) when the interaction is deferred', async () => {
    const ix = buildMockInteraction({ commandName: 'crash', deferred: true });
    await dispatch(crashSet, ix);

    expect(ix.followUp).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(ix.reply).not.toHaveBeenCalled();
  });
});
