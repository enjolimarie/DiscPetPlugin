const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getPet, createPet, deletePet, renamePet, updateStat, addXP, xpToNextLevel, applyDecay, claimDaily, spendTreats, streakMultiplier, getTodayTasks, recordTaskAction, TASK_POOL, addToInventory, getInventory, useFromInventory, incrementActionCount, incrementItemsBought, BADGE_DEFINITIONS, getEarnedBadges, checkBadges } = require('../database/db');

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

// Derives a mood label and emoji from current stats and time since last interaction
function getMoodState(pet, now = Date.now()) {
  const hoursSince = (now - pet.last_updated) / (1000 * 60 * 60);

  if (pet.cleanliness < 20)                        return { label: 'Sick',    emoji: '🤢' };
  if (pet.hunger      < 20)                        return { label: 'Grumpy',  emoji: '😠' };
  if (pet.energy      < 20)                        return { label: 'Sleepy',  emoji: '😴' };
  if (pet.mood < 30 || hoursSince > 24)            return { label: 'Sad',     emoji: '😢' };
  if (hoursSince > 8)                              return { label: 'Lonely',  emoji: '🥺' };
  if (pet.mood < 50)                               return { label: 'Bored',   emoji: '😐' };
  if (pet.mood >= 70 && pet.hunger >= 50 && pet.energy >= 50) return { label: 'Happy', emoji: '😊' };
  return { label: 'Content', emoji: '😌' };
}

// Renders an XP progress bar toward the next level
function xpBar(xp, level) {
  const needed = xpToNextLevel(level);
  const filled = Math.round((xp / needed) * 10);
  return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, 10 - filled)) + ` ${xp}/${needed}`;
}

function getLifeStage(level) {
  if (level <= 5)  return { label: 'Baby',  emoji: '🍼' };
  if (level <= 15) return { label: 'Child', emoji: '🌱' };
  if (level <= 30) return { label: 'Teen',  emoji: '⚡' };
  return                  { label: 'Adult', emoji: '👑' };
}

function buildStatusEmbed(pet) {
  const emoji     = speciesEmoji(pet.species);
  const avg       = Math.round((pet.hunger + pet.mood + pet.energy + pet.cleanliness) / 4);
  const color     = avg >= 70 ? 0x57f287 : avg >= 40 ? 0xfee75c : 0xed4245;
  const moodState = getMoodState(pet);
  const stage     = getLifeStage(pet.level);

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} ${pet.pet_name}`)
    .setDescription(`*A level ${pet.level} ${pet.species}* • ${stage.emoji} ${stage.label} • ${moodState.emoji} ${moodState.label}`)
    .addFields(
      { name: '🍖 Hunger',      value: statBar(pet.hunger),          inline: false },
      { name: '😊 Mood',        value: statBar(pet.mood),            inline: false },
      { name: '⚡ Energy',       value: statBar(pet.energy),          inline: false },
      { name: '🛁 Cleanliness', value: statBar(pet.cleanliness),     inline: false },
      { name: '⭐ Level',        value: `${pet.level}`,               inline: true  },
      { name: '✨ XP',           value: xpBar(pet.xp, pet.level),    inline: true  },
      { name: '🍬 Treats',       value: `${pet.treats ?? 0}`,        inline: true  },
      { name: '🔥 Streak',       value: `${pet.streak ?? 1} day${(pet.streak ?? 1) !== 1 ? 's' : ''}`, inline: true },
    )
    .setFooter({ text: `Last updated • ${new Date(pet.last_updated).toLocaleString()}` });
}

function badgeNote(newBadges) {
  if (!newBadges.length) return '';
  const list = newBadges.map(b => `${b.emoji} **${b.label}**`).join(', ');
  return `🏅 Badge${newBadges.length > 1 ? 's' : ''} unlocked: ${list}!`;
}

const SHOP_ITEMS = {
  premium_food: {
    name:        'Premium Food',
    emoji:       '🥩',
    cost:        10,
    description: 'A gourmet meal that satisfies more than regular food.',
    changes:     [['hunger', +40]],
    xp:          25,
  },
  premium_toy: {
    name:        'Premium Toy',
    emoji:       '🎪',
    cost:        10,
    description: 'An exciting toy that keeps your pet entertained for hours.',
    changes:     [['mood', +30], ['energy', -5]],
    xp:          25,
  },
  luxury_bath: {
    name:        'Luxury Bath',
    emoji:       '🛁',
    cost:        8,
    description: 'A spa-quality grooming session.',
    changes:     [['cleanliness', +40]],
    xp:          20,
  },
  energy_drink: {
    name:        'Energy Drink',
    emoji:       '⚡',
    cost:        8,
    description: 'A special supplement that restores energy quickly.',
    changes:     [['energy', +40]],
    xp:          20,
  },
};

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
  getMoodState,
  getLifeStage,
  buildStatusEmbed,
  SHOP_ITEMS,
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
      sub.setName('daily').setDescription('Claim your daily XP and treat reward'),
    )
    .addSubcommand(sub =>
      sub.setName('tasks').setDescription("View today's daily tasks and your progress"),
    )
    .addSubcommand(sub =>
      sub.setName('badges').setDescription('View your earned badges and locked milestones'),
    )
    .addSubcommand(sub =>
      sub.setName('shop').setDescription('Browse the treat shop'),
    )
    .addSubcommand(sub =>
      sub
        .setName('buy')
        .setDescription('Buy an item from the shop — stores it in your inventory')
        .addStringOption(opt =>
          opt
            .setName('item')
            .setDescription('The item to purchase')
            .setRequired(true)
            .addChoices(
              { name: 'Premium Food (10 treats)',  value: 'premium_food'  },
              { name: 'Premium Toy (10 treats)',   value: 'premium_toy'   },
              { name: 'Luxury Bath (8 treats)',    value: 'luxury_bath'   },
              { name: 'Energy Drink (8 treats)',   value: 'energy_drink'  },
            ),
        ),
    )
    .addSubcommand(sub =>
      sub.setName('inventory').setDescription('View your stored items'),
    )
    .addSubcommand(sub =>
      sub
        .setName('use')
        .setDescription('Use an item from your inventory on the server pet')
        .addStringOption(opt =>
          opt
            .setName('item')
            .setDescription('The item to use')
            .setRequired(true)
            .addChoices(
              { name: 'Premium Food',  value: 'premium_food'  },
              { name: 'Premium Toy',   value: 'premium_toy'   },
              { name: 'Luxury Bath',   value: 'luxury_bath'   },
              { name: 'Energy Drink',  value: 'energy_drink'  },
            ),
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
      incrementActionCount(guildId, sub);
      const done       = recordTaskAction(guildId, sub);
      const newBadges  = checkBadges(guildId, interaction.user.id);
      const updated    = getPet(guildId);
      const taskNote   = done.map(t => `✅ Task complete: **${t.label}**! +${t.treats} 🍬 +${t.xp} XP`).join('\n');
      return interaction.reply({
        content: [`You ${action.verb} **${pet.pet_name}**! ${action.emoji}`, taskNote, badgeNote(newBadges)].filter(Boolean).join('\n'),
        embeds: [buildStatusEmbed(updated)],
      });
    }

    // ── /pet daily ────────────────────────────────────────────────────────────
    if (sub === 'daily') {
      const result = claimDaily(guildId);
      if (!result) {
        return interaction.reply({
          content: "This server doesn't have a pet yet! Use `/pet adopt` to get one.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!result.claimed) {
        const hours   = Math.floor(result.msUntilReset / (1000 * 60 * 60));
        const minutes = Math.floor((result.msUntilReset % (1000 * 60 * 60)) / (1000 * 60));
        return interaction.reply({
          content: `You've already claimed today's reward! Come back in **${hours}h ${minutes}m**.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const streakLine = result.streak > 1
        ? ` 🔥 **${result.streak}-day streak!**${result.multiplier > 1 ? ` (${result.multiplier}× bonus)` : ''}`
        : '';
      const dailyDone  = recordTaskAction(guildId, 'daily');
      const newBadges  = checkBadges(guildId, interaction.user.id);
      const taskNote   = dailyDone.map(t => `✅ Task complete: **${t.label}**! +${t.treats} 🍬 +${t.xp} XP`).join('\n');
      return interaction.reply({
        content: [`🎁 Daily reward claimed! **${result.pet.pet_name}** received **+${result.xp} XP** and **+${result.treats} treats**!${streakLine}`, taskNote, badgeNote(newBadges)].filter(Boolean).join('\n'),
        embeds: [buildStatusEmbed(result.pet)],
      });
    }

    // ── /pet shop ─────────────────────────────────────────────────────────────
    if (sub === 'shop') {
      const pet = getPet(guildId);
      const balance = pet ? pet.treats : 0;

      const fields = Object.values(SHOP_ITEMS).map(item => ({
        name:   `${item.emoji} ${item.name} — ${item.cost} 🍬`,
        value:  item.description,
        inline: false,
      }));

      const embed = new EmbedBuilder()
        .setColor(0xf9a825)
        .setTitle('🛒 Pet Shop')
        .setDescription(`Your balance: **${balance} 🍬 treats**\nUse \`/pet buy\` to purchase an item.`)
        .addFields(fields)
        .setFooter({ text: 'Earn treats with /pet daily' });

      return interaction.reply({ embeds: [embed] });
    }

    // ── /pet buy ──────────────────────────────────────────────────────────────
    if (sub === 'buy') {
      const pet = getPet(guildId);
      if (!pet) {
        return interaction.reply({
          content: "This server doesn't have a pet yet! Use `/pet adopt` to get one.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const itemKey = interaction.options.getString('item');
      const item    = SHOP_ITEMS[itemKey];

      const spent = spendTreats(guildId, item.cost);
      if (!spent) {
        return interaction.reply({
          content: `Not enough treats! **${item.name}** costs **${item.cost} 🍬** but **${pet.pet_name}** only has **${pet.treats} 🍬**.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      addToInventory(guildId, interaction.user.id, itemKey);
      incrementItemsBought(guildId);
      const buyDone  = recordTaskAction(guildId, 'buy');
      const newBadges = checkBadges(guildId, interaction.user.id);
      const taskNote = buyDone.map(t => `✅ Task complete: **${t.label}**! +${t.treats} 🍬 +${t.xp} XP`).join('\n');
      return interaction.reply({
        content: [`${item.emoji} **${item.name}** added to your inventory! (-${item.cost} 🍬)\nUse \`/pet use\` when you're ready to apply it.`, taskNote, badgeNote(newBadges)].filter(Boolean).join('\n'),
      });
    }

    // ── /pet inventory ────────────────────────────────────────────────────────
    if (sub === 'inventory') {
      const rows = getInventory(guildId, interaction.user.id);

      if (rows.length === 0) {
        return interaction.reply({
          content: "Your inventory is empty! Buy items from the shop with `/pet buy`.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const fields = rows.map(row => {
        const item = SHOP_ITEMS[row.item_key];
        return {
          name:   `${item.emoji} ${item.name} ×${row.quantity}`,
          value:  item.description,
          inline: false,
        };
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🎒 ${interaction.user.displayName}'s Inventory`)
        .addFields(fields)
        .setFooter({ text: 'Use /pet use to apply an item to your pet.' });

      return interaction.reply({ embeds: [embed] });
    }

    // ── /pet use ──────────────────────────────────────────────────────────────
    if (sub === 'use') {
      const pet = applyDecay(guildId);
      if (!pet) {
        return interaction.reply({
          content: "This server doesn't have a pet yet! Use `/pet adopt` to get one.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const itemKey = interaction.options.getString('item');
      const item    = SHOP_ITEMS[itemKey];

      const consumed = useFromInventory(guildId, interaction.user.id, itemKey);
      if (!consumed) {
        return interaction.reply({
          content: `You don't have **${item.name}** in your inventory. Buy one with \`/pet buy\`.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      for (const [stat, delta] of item.changes) {
        updateStat(guildId, stat, delta);
      }
      addXP(guildId, item.xp);
      const newBadges = checkBadges(guildId, interaction.user.id);
      const updated   = getPet(guildId);
      return interaction.reply({
        content: [`${item.emoji} You used **${item.name}** on **${pet.pet_name}**! (+${item.xp} XP)`, badgeNote(newBadges)].filter(Boolean).join('\n'),
        embeds: [buildStatusEmbed(updated)],
      });
    }

    // ── /pet tasks ────────────────────────────────────────────────────────────
    if (sub === 'tasks') {
      const pet = getPet(guildId);
      if (!pet) {
        return interaction.reply({
          content: "This server doesn't have a pet yet! Use `/pet adopt` to get one.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const rows  = getTodayTasks(guildId);
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

      const lines = rows.map(row => {
        const def      = TASK_POOL.find(t => t.key === row.task_key);
        const check    = row.completed ? '✅' : '🔲';
        const progress = row.completed ? `~~${def.target}/${def.target}~~` : `${row.progress}/${def.target}`;
        return `${check} ${def.emoji} **${def.label}** — ${def.description} (${progress}) · +${def.treats} 🍬 +${def.xp} XP`;
      });

      const allDone = rows.every(r => r.completed);
      const footer  = allDone ? 'All tasks complete for today! Come back tomorrow for new tasks.' : 'Rewards are granted automatically when each task is completed.';

      const embed = new EmbedBuilder()
        .setColor(allDone ? 0x57f287 : 0x5865f2)
        .setTitle(`📋 Daily Tasks — ${today}`)
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: footer });

      return interaction.reply({ embeds: [embed] });
    }

    // ── /pet badges ───────────────────────────────────────────────────────────
    if (sub === 'badges') {
      const earned    = getEarnedBadges(guildId, interaction.user.id);
      const earnedMap = new Map(earned.map(r => [r.badge_key, r.earned_at]));
      const total     = BADGE_DEFINITIONS.length;
      const count     = earnedMap.size;

      const lines = BADGE_DEFINITIONS.map(badge => {
        if (earnedMap.has(badge.key)) {
          const date = new Date(earnedMap.get(badge.key)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
          return `✅ ${badge.emoji} **${badge.label}** — earned ${date}`;
        }
        return `🔒 ${badge.emoji} **${badge.label}** — ${badge.description}`;
      });

      const embed = new EmbedBuilder()
        .setColor(count === total ? 0xffd700 : count > 0 ? 0x5865f2 : 0x747f8d)
        .setTitle(`🏆 ${interaction.user.displayName}'s Badges — ${count} / ${total}`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: count === total ? '🎉 All badges unlocked!' : 'Keep playing to unlock more badges.' });

      return interaction.reply({ embeds: [embed] });
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
