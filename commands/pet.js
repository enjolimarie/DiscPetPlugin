const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getPet, createPet, deletePet, renamePet, updateStat, addXP, xpToNextLevel, applyDecay } = require('../database/db');

const SPECIES_EMOJI = {
  cat:          '🐱',
  dog:          '🐶',
  fish:         '🐟',
  chameleon:    '🦎',
  hedgehog:     '🦔',
  hamster:      '🐹',
  mouse:        '🐭',
  gerbil:       '🐀',
  'guinea pig': '🐾',
  rabbit:       '🐰',
};

function speciesEmoji(species) {
  return SPECIES_EMOJI[species.toLowerCase()] ?? '🐾';
}

// Renders a 10-block progress bar, e.g. "████████░░ 80/100"
function statBar(value) {
  const filled = Math.round(value / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${value}/100`;
}

// Renders an XP progress bar toward the next level
function xpBar(xp, level) {
  const needed = xpToNextLevel(level);
  const filled = Math.round((xp / needed) * 10);
  return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, 10 - filled)) + ` ${xp}/${needed}`;
}

function buildStatusEmbed(pet) {
  const emoji = speciesEmoji(pet.species);
  const avg   = Math.round((pet.hunger + pet.mood + pet.energy + pet.cleanliness) / 4);
  const color = avg >= 70 ? 0x57f287 : avg >= 40 ? 0xfee75c : 0xed4245;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} ${pet.pet_name}`)
    .setDescription(`*A level ${pet.level} ${pet.species}*`)
    .addFields(
      { name: '🍖 Hunger',      value: statBar(pet.hunger),          inline: false },
      { name: '😊 Mood',        value: statBar(pet.mood),            inline: false },
      { name: '⚡ Energy',       value: statBar(pet.energy),          inline: false },
      { name: '🛁 Cleanliness', value: statBar(pet.cleanliness),     inline: false },
      { name: '⭐ Level',        value: `${pet.level}`,               inline: true  },
      { name: '✨ XP',           value: xpBar(pet.xp, pet.level),    inline: true  },
    )
    .setFooter({ text: `Last updated • ${new Date(pet.last_updated).toLocaleString()}` });
}

// Stat changes and XP reward for each action subcommand
const ACTION_MAP = {
  feed:  { changes: [['hunger', +20]],                    xp: 10, verb: 'fed',          emoji: '🍖' },
  play:  { changes: [['mood', +15], ['energy', -10]],     xp: 10, verb: 'played with',  emoji: '🎾' },
  clean: { changes: [['cleanliness', +20], ['mood', -5]], xp: 10, verb: 'cleaned',      emoji: '🛁' },
  sleep: { changes: [['energy', +30], ['mood', -5]],      xp: 5,  verb: 'put to sleep', emoji: '💤' },
};

module.exports = {
  statBar,
  speciesEmoji,
  xpBar,
  buildStatusEmbed,
  data: new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Manage your server pet')
    .addSubcommand(sub =>
      sub
        .setName('adopt')
        .setDescription('Adopt a new pet for this server (one pet per server)')
        .addStringOption(opt =>
          opt
            .setName('name')
            .setDescription('Give your pet a name')
            .setRequired(true),
        )
        .addStringOption(opt =>
          opt
            .setName('species')
            .setDescription('Choose a species')
            .setRequired(true)
            .addChoices(
              { name: 'Cat',        value: 'cat'        },
              { name: 'Dog',        value: 'dog'        },
              { name: 'Fish',       value: 'fish'       },
              { name: 'Chameleon',  value: 'chameleon'  },
              { name: 'Hedgehog',   value: 'hedgehog'   },
              { name: 'Hamster',    value: 'hamster'    },
              { name: 'Mouse',      value: 'mouse'      },
              { name: 'Gerbil',     value: 'gerbil'     },
              { name: 'Guinea Pig', value: 'guinea pig' },
              { name: 'Rabbit',     value: 'rabbit'     },
              { name: 'Custom',     value: 'custom'     },
            ),
        )
        .addStringOption(opt =>
          opt
            .setName('custom_species')
            .setDescription('Custom species name — required when species is "Custom"')
            .setRequired(false),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription("View your server pet's current status"),
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Permanently remove this server\'s pet')
        .addStringOption(opt =>
          opt
            .setName('confirm')
            .setDescription('Type the pet\'s name to confirm removal')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('rename')
        .setDescription('Give your pet a new name')
        .addStringOption(opt =>
          opt
            .setName('name')
            .setDescription('The new name for your pet')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub.setName('feed').setDescription('Feed your pet to restore hunger'),
    )
    .addSubcommand(sub =>
      sub.setName('play').setDescription('Play with your pet to boost mood'),
    )
    .addSubcommand(sub =>
      sub.setName('clean').setDescription('Bathe your pet to restore cleanliness'),
    )
    .addSubcommand(sub =>
      sub.setName('sleep').setDescription('Let your pet sleep to restore energy'),
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;

    if (!guildId) {
      return interaction.reply({
        content: 'Pet commands can only be used inside a server, not in DMs.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub = interaction.options.getSubcommand();

    // ── action commands (feed / play / clean / sleep) ─────────────────────────
    const action = ACTION_MAP[sub];
    if (action) {
      const pet = applyDecay(guildId);
      if (!pet) {
        return interaction.reply({
          content: "This server doesn't have a pet yet! Use `/pet adopt` to get one.",
          flags: MessageFlags.Ephemeral,
        });
      }
      for (const [stat, delta] of action.changes) {
        updateStat(guildId, stat, delta);
      }
      addXP(guildId, action.xp);
      const updated = getPet(guildId);
      return interaction.reply({
        content: `You ${action.verb} **${pet.pet_name}**! ${action.emoji}`,
        embeds: [buildStatusEmbed(updated)],
      });
    }

    // ── /pet rename ───────────────────────────────────────────────────────────
    if (sub === 'rename') {
      const pet = getPet(guildId);
      if (!pet) {
        return interaction.reply({
          content: "This server doesn't have a pet yet! Use `/pet adopt` to get one.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const newName = interaction.options.getString('name').trim();
      if (!newName) {
        return interaction.reply({
          content: 'Please provide a valid name.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const oldName = pet.pet_name;
      renamePet(guildId, newName);
      return interaction.reply({
        content: `**${oldName}** has been renamed to **${newName}**! 📝`,
      });
    }

    // ── /pet adopt ────────────────────────────────────────────────────────────
    if (sub === 'adopt') {
      const existing = getPet(guildId);
      if (existing) {
        return interaction.reply({
          content: `This server already has a pet named **${existing.pet_name}**! Each server can only have one pet.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const name    = interaction.options.getString('name');
      const species = interaction.options.getString('species');
      const custom  = interaction.options.getString('custom_species');

      if (species === 'custom') {
        if (!custom?.trim()) {
          return interaction.reply({
            content: 'You selected **Custom** species but did not provide a `custom_species` value. Please re-run the command and fill in that field.',
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      const finalSpecies = species === 'custom' ? custom.trim() : species;
      const pet = createPet(guildId, name, finalSpecies);

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`${speciesEmoji(finalSpecies)} ${pet.pet_name} has been adopted!`)
        .setDescription(`Welcome **${pet.pet_name}** the ${finalSpecies} to the server! 🎉`)
        .addFields(
          { name: 'Species', value: finalSpecies, inline: true },
          { name: 'Level',   value: `${pet.level}`,    inline: true },
        )
        .setFooter({ text: 'Use /pet status to check in on your new friend.' });

      return interaction.reply({ embeds: [embed] });
    }

    // ── /pet remove ───────────────────────────────────────────────────────────
    if (sub === 'remove') {
      const pet = getPet(guildId);
      if (!pet) {
        return interaction.reply({
          content: "This server doesn't have a pet to remove.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const confirmation = interaction.options.getString('confirm');
      if (confirmation !== pet.pet_name) {
        return interaction.reply({
          content: `That name doesn't match. To confirm, type the pet's name exactly: **${pet.pet_name}**`,
          flags: MessageFlags.Ephemeral,
        });
      }

      deletePet(guildId);
      return interaction.reply({
        content: `**${pet.pet_name}** has been removed. You can adopt a new pet with \`/pet adopt\`.`,
      });
    }

    // ── /pet status ───────────────────────────────────────────────────────────
    if (sub === 'status') {
      const pet = applyDecay(guildId);
      if (!pet) {
        return interaction.reply({
          content: "This server doesn't have a pet yet! Use `/pet adopt` to get one.",
          flags: MessageFlags.Ephemeral,
        });
      }
      return interaction.reply({ embeds: [buildStatusEmbed(pet)] });
    }
  },
};
