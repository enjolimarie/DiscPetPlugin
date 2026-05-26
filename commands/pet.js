const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getPet, createPet, deletePet } = require('../database/db');

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

module.exports = {
  statBar,       // exported for unit testing
  speciesEmoji,  // exported for unit testing
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
      const pet = getPet(guildId);
      if (!pet) {
        return interaction.reply({
          content: "This server doesn't have a pet yet! Use `/pet adopt` to get one.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const emoji = speciesEmoji(pet.species);

      // Embed color reflects overall health: green → yellow → red
      const avg   = Math.round((pet.hunger + pet.mood + pet.energy + pet.cleanliness) / 4);
      const color = avg >= 70 ? 0x57f287 : avg >= 40 ? 0xfee75c : 0xed4245;

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${emoji} ${pet.pet_name}`)
        .setDescription(`*A level ${pet.level} ${pet.species}*`)
        .addFields(
          { name: '🍖 Hunger',      value: statBar(pet.hunger),      inline: false },
          { name: '😊 Mood',        value: statBar(pet.mood),        inline: false },
          { name: '⚡ Energy',       value: statBar(pet.energy),      inline: false },
          { name: '🛁 Cleanliness', value: statBar(pet.cleanliness), inline: false },
          { name: '⭐ Level',        value: `${pet.level}`,           inline: true  },
          { name: '✨ XP',           value: `${pet.xp}`,              inline: true  },
          // TODO: Add an XP progress bar toward next level once leveling thresholds are defined
        )
        .setFooter({ text: `Last updated • ${new Date(pet.last_updated).toLocaleString()}` });

      return interaction.reply({ embeds: [embed] });
    }
  },
};
