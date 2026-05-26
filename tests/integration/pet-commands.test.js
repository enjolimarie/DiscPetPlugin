jest.mock('../../database/db', () => ({
  getPet:    jest.fn(),
  createPet: jest.fn(),
  deletePet: jest.fn(),
  clamp:     jest.fn((v) => Math.max(0, Math.min(100, Math.round(v)))),
}));

const { execute } = require('../../commands/pet');
const { getPet, createPet, deletePet } = require('../../database/db');
const { buildMockInteraction } = require('../helpers/mockInteraction');

const HEALTHY_PET = {
  guild_id:     'guild-123',
  pet_name:     'Buddy',
  species:      'dog',
  hunger:       80,
  mood:         80,
  energy:       80,
  cleanliness:  80,
  level:        1,
  xp:           0,
  last_updated: Date.now(),
};

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// /pet adopt
// ─────────────────────────────────────────────────────────────────────────────
describe('/pet adopt', () => {
  test('creates a pet and replies with a success embed', async () => {
    getPet.mockReturnValue(undefined);
    createPet.mockReturnValue({ ...HEALTHY_PET, pet_name: 'Whiskers', species: 'cat' });

    const ix = buildMockInteraction({ options: { name: 'Whiskers', species: 'cat' } });
    await execute(ix);

    expect(createPet).toHaveBeenCalledWith('guild-123', 'Whiskers', 'cat');
    expect(ix.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  test('embed title contains the pet name', async () => {
    getPet.mockReturnValue(undefined);
    createPet.mockReturnValue({ ...HEALTHY_PET, pet_name: 'Biscuit', species: 'dog' });

    const ix = buildMockInteraction({ options: { name: 'Biscuit', species: 'dog' } });
    await execute(ix);

    const embed = ix.reply.mock.calls[0][0].embeds[0];
    expect(embed.data.title).toContain('Biscuit');
  });

  test('replies ephemerally when the server already has a pet', async () => {
    getPet.mockReturnValue({ pet_name: 'OldPet' });

    const ix = buildMockInteraction({ options: { name: 'NewPet', species: 'dog' } });
    await execute(ix);

    expect(createPet).not.toHaveBeenCalled();
    expect(ix.reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: 64, content: expect.stringContaining('OldPet') }),
    );
  });

  test('replies ephemerally when "custom" species is chosen but no value is provided', async () => {
    getPet.mockReturnValue(undefined);

    const ix = buildMockInteraction({ options: { name: 'Ghost', species: 'custom', custom_species: null } });
    await execute(ix);

    expect(createPet).not.toHaveBeenCalled();
    expect(ix.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }));
  });

  test('replies ephemerally when custom_species is whitespace only', async () => {
    getPet.mockReturnValue(undefined);

    const ix = buildMockInteraction({ options: { name: 'Ghost', species: 'custom', custom_species: '   ' } });
    await execute(ix);

    expect(createPet).not.toHaveBeenCalled();
    expect(ix.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }));
  });

  test('uses the custom_species value as the final species', async () => {
    getPet.mockReturnValue(undefined);
    createPet.mockReturnValue({ ...HEALTHY_PET, species: 'axolotl' });

    const ix = buildMockInteraction({ options: { name: 'Axo', species: 'custom', custom_species: 'axolotl' } });
    await execute(ix);

    expect(createPet).toHaveBeenCalledWith('guild-123', 'Axo', 'axolotl');
  });

  test('trims whitespace from custom_species before storing', async () => {
    getPet.mockReturnValue(undefined);
    createPet.mockReturnValue({ ...HEALTHY_PET, species: 'axolotl' });

    const ix = buildMockInteraction({ options: { name: 'Axo', species: 'custom', custom_species: '  axolotl  ' } });
    await execute(ix);

    expect(createPet).toHaveBeenCalledWith('guild-123', 'Axo', 'axolotl');
  });

  test('refuses with ephemeral error when invoked in a DM (Issue 001)', async () => {
    getPet.mockReturnValue(undefined);

    const ix = buildMockInteraction({ guildId: null, options: { name: 'Ghost', species: 'cat' } });
    await execute(ix);

    expect(createPet).not.toHaveBeenCalled();
    expect(ix.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /pet remove
// ─────────────────────────────────────────────────────────────────────────────
describe('/pet remove', () => {
  test('replies ephemerally when the server has no pet', async () => {
    getPet.mockReturnValue(undefined);

    const ix = buildMockInteraction({ subcommand: 'remove', options: { confirm: 'Buddy' } });
    await execute(ix);

    expect(deletePet).not.toHaveBeenCalled();
    expect(ix.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }));
  });

  test('replies ephemerally when the confirmation name does not match', async () => {
    getPet.mockReturnValue(HEALTHY_PET);

    const ix = buildMockInteraction({ subcommand: 'remove', options: { confirm: 'WrongName' } });
    await execute(ix);

    expect(deletePet).not.toHaveBeenCalled();
    expect(ix.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }));
  });

  test('deletes the pet and replies when the name matches exactly', async () => {
    getPet.mockReturnValue(HEALTHY_PET);

    const ix = buildMockInteraction({ subcommand: 'remove', options: { confirm: 'Buddy' } });
    await execute(ix);

    expect(deletePet).toHaveBeenCalledWith('guild-123');
    expect(ix.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Buddy') }));
  });

  test('confirmation is case-sensitive', async () => {
    getPet.mockReturnValue(HEALTHY_PET);

    const ix = buildMockInteraction({ subcommand: 'remove', options: { confirm: 'buddy' } });
    await execute(ix);

    expect(deletePet).not.toHaveBeenCalled();
    expect(ix.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /pet status
// ─────────────────────────────────────────────────────────────────────────────
describe('/pet status', () => {
  test('replies ephemerally when the server has no pet', async () => {
    getPet.mockReturnValue(undefined);

    const ix = buildMockInteraction({ subcommand: 'status' });
    await execute(ix);

    expect(ix.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }));
  });

  test('replies with an embed when a pet exists', async () => {
    getPet.mockReturnValue(HEALTHY_PET);

    const ix = buildMockInteraction({ subcommand: 'status' });
    await execute(ix);

    expect(ix.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  test('embed title contains the pet name', async () => {
    getPet.mockReturnValue(HEALTHY_PET);

    const ix = buildMockInteraction({ subcommand: 'status' });
    await execute(ix);

    expect(ix.reply.mock.calls[0][0].embeds[0].data.title).toContain('Buddy');
  });

  test('embed uses green (0x57f287) when average stat >= 70', async () => {
    getPet.mockReturnValue({ ...HEALTHY_PET, hunger: 80, mood: 80, energy: 80, cleanliness: 80 });

    const ix = buildMockInteraction({ subcommand: 'status' });
    await execute(ix);

    expect(ix.reply.mock.calls[0][0].embeds[0].data.color).toBe(0x57f287);
  });

  test('embed uses yellow (0xfee75c) when average stat is 40–69', async () => {
    getPet.mockReturnValue({ ...HEALTHY_PET, hunger: 50, mood: 50, energy: 50, cleanliness: 50 });

    const ix = buildMockInteraction({ subcommand: 'status' });
    await execute(ix);

    expect(ix.reply.mock.calls[0][0].embeds[0].data.color).toBe(0xfee75c);
  });

  test('embed uses red (0xed4245) when average stat < 40', async () => {
    getPet.mockReturnValue({ ...HEALTHY_PET, hunger: 10, mood: 10, energy: 10, cleanliness: 10 });

    const ix = buildMockInteraction({ subcommand: 'status' });
    await execute(ix);

    expect(ix.reply.mock.calls[0][0].embeds[0].data.color).toBe(0xed4245);
  });

  test('colour boundary: exactly 70 average is green', async () => {
    getPet.mockReturnValue({ ...HEALTHY_PET, hunger: 70, mood: 70, energy: 70, cleanliness: 70 });

    const ix = buildMockInteraction({ subcommand: 'status' });
    await execute(ix);

    expect(ix.reply.mock.calls[0][0].embeds[0].data.color).toBe(0x57f287);
  });

  test('colour boundary: exactly 40 average is yellow', async () => {
    getPet.mockReturnValue({ ...HEALTHY_PET, hunger: 40, mood: 40, energy: 40, cleanliness: 40 });

    const ix = buildMockInteraction({ subcommand: 'status' });
    await execute(ix);

    expect(ix.reply.mock.calls[0][0].embeds[0].data.color).toBe(0xfee75c);
  });

  test('embed includes fields for all four stats', async () => {
    getPet.mockReturnValue(HEALTHY_PET);

    const ix = buildMockInteraction({ subcommand: 'status' });
    await execute(ix);

    const names = ix.reply.mock.calls[0][0].embeds[0].data.fields.map(f => f.name);
    expect(names).toEqual(expect.arrayContaining([
      expect.stringContaining('Hunger'),
      expect.stringContaining('Mood'),
      expect.stringContaining('Energy'),
      expect.stringContaining('Cleanliness'),
    ]));
  });
});
