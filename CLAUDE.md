# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

DiscPlugin is a Discord bot built with **discord.js v14** and **better-sqlite3**. Each Discord guild shares one pet stored in a SQLite database. Members interact with the pet through slash commands.

## Setup and Running

```bash
npm install
cp .env.example .env
# Fill in DISCORD_TOKEN, CLIENT_ID, and optionally GUILD_ID

npm run deploy   # register slash commands with Discord (re-run after adding commands)
npm start        # start the bot
```

`pets.db` is created automatically in the project root on first run.

## Architecture

- **`index.js`** — Creates the `Client`, auto-loads all files from `commands/` into a `Collection`, and dispatches `interactionCreate` events to the matching command's `execute()`. Includes a client-level error handler and a wrapped error reply to prevent crashes on expired interactions.
- **`deploy-commands.js`** — One-shot script that POSTs slash command schemas to Discord's REST API. Set `GUILD_ID` for instant guild-scoped registration during development; omit for global.
- **`commands/pet.js`** — Defines the `/pet` command tree. Subcommands branch inside a single `execute()` on `interaction.options.getSubcommand()`. Action subcommands (feed/play/clean/sleep) are driven by `ACTION_MAP`. Status embed is built by the shared `buildStatusEmbed()` helper so all commands display the same layout.
- **`database/db.js`** — Opens `pets.db`, creates the `pets` table if needed, and exports synchronous helper functions. All stat values go through `clamp()`. XP leveling uses tiered thresholds via `xpToNextLevel(level)`.

## Implemented Commands

| Command | Description |
|---|---|
| `/pet adopt` | Adopt a new pet (name + species). One per server. Supports custom species. |
| `/pet status` | Display current stats, level, XP progress bar, life stage, mood state, and streak. Color-coded by average health. |
| `/pet remove` | Permanently remove the server's pet. Requires typing the pet's name to confirm. |
| `/pet feed` | Hunger +20, XP +10. Shows updated status embed. |
| `/pet play` | Mood +15, Energy -10, XP +10. Shows updated status embed. |
| `/pet clean` | Cleanliness +20, Mood -5, XP +10. Shows updated status embed. |
| `/pet sleep` | Energy +30, Mood -5, XP +5. Shows updated status embed. |
| `/pet rename` | Give the server pet a new name. |
| `/pet daily` | Claim daily reward: base +50 XP and +5 treats (scaled by streak multiplier). Once per UTC day. Shows cooldown if already claimed. |
| `/pet shop` | Browse the treat shop — shows all items, costs, and effects. |
| `/pet buy` | Purchase a shop item using treats — stores it in your personal inventory. |
| `/pet inventory` | View your stored items (per user, per guild) with quantities. |
| `/pet use` | Apply a stored item from your inventory to the server pet. |
| `/pet tasks` | View today's 3 daily tasks with checkmark progress. Completing tasks awards 5–10 treats + XP automatically. |
| `/pet badges` | View your personal badge collection — ✅ earned (with date) and 🔒 locked (with hint). |

## Database Layer (`database/db.js`)

| Function | Description |
|---|---|
| `addToInventory(guildId, userId, itemKey)` | Adds one item to the user's inventory; increments quantity if already present. |
| `getInventory(guildId, userId)` | Returns all inventory rows for the user in the guild. |
| `useFromInventory(guildId, userId, itemKey)` | Decrements item quantity (removes row at 0). Returns `true` on success, `false` if not held. |
| `getTodayTasks(guildId)` | Returns today's 3 task rows, generating them lazily if first call of the day. |
| `recordTaskAction(guildId, actionType)` | Increments progress on matching tasks; completes and awards treats+XP on target reached. Returns array of newly-completed task defs. |
| `getUtcDateKey(now?)` | Returns the UTC date as `YYYY-MM-DD`. |
| `getPet(guildId)` | Returns the pet row or undefined. |
| `createPet(guildId, name, species)` | Inserts a new pet with all stats at 80. |
| `deletePet(guildId)` | Removes the pet row. |
| `renamePet(guildId, newName)` | Updates the pet's name and returns the updated row. |
| `applyDecay(guildId)` | Computes time-based stat decay since `last_updated`, persists results, returns updated pet or null. |
| `updateStat(guildId, stat, delta)` | Applies a delta to one stat column, clamped to [0, 100]. |
| `addXP(guildId, amount)` | Adds XP and triggers level-ups with carry-over. |
| `xpToNextLevel(level)` | Stage-based XP threshold: Baby 100, Child 250, Teen 500, Adult 1000. |
| `claimDaily(guildId)` | Awards daily XP and treats (scaled by streak) if not yet claimed today (UTC). Returns `{ claimed, xp, treats, streak, multiplier, pet }` or `{ claimed: false, msUntilReset }`. |
| `streakMultiplier(streak)` | Returns reward multiplier: 1 (default), 1.5 (7+ days), 2 (30+ days). |
| `spendTreats(guildId, amount)` | Deducts treats if balance is sufficient. Returns `true` on success, `false` if insufficient or no pet. |
| `clamp(val)` | Clamps and rounds a value to [0, 100]. |

## Helper Functions (`commands/pet.js`)

| Function | Description |
|---|---|
| `getLifeStage(level)` | Returns `{ label, emoji }` for the pet's life stage (Baby/Child/Teen/Adult). |
| `getMoodState(pet, now)` | Derives mood label+emoji (Sick/Grumpy/Sleepy/Sad/Lonely/Bored/Happy/Content) from stats and time since last interaction. |
| `buildStatusEmbed(pet)` | Builds the full EmbedBuilder status card shown by status and action commands. |
| `statBar(value)` | Renders a 10-block ASCII progress bar for a stat value. |
| `xpBar(xp, level)` | Renders an XP progress bar toward the next level. |
| `speciesEmoji(species)` | Returns the emoji for a given species string. |

## Pets Table Schema

| Column | Type | Default |
|---|---|---|
| `guild_id` | TEXT PK | — |
| `pet_name` | TEXT | — |
| `species` | TEXT | — |
| `hunger` | INTEGER | 80 |
| `mood` | INTEGER | 80 |
| `energy` | INTEGER | 80 |
| `cleanliness` | INTEGER | 80 |
| `level` | INTEGER | 1 |
| `xp` | INTEGER | 0 |
| `last_updated` | INTEGER | epoch ms |
| `treats` | INTEGER | 0 |
| `last_daily` | INTEGER | 0 (never claimed) |
| `streak` | INTEGER | 1 |

Stats are always clamped to `[0, 100]`. Use `clamp()` from `database/db.js` whenever writing a stat.
New columns are added via `ALTER TABLE … ADD COLUMN` with a try/catch so existing databases migrate automatically.

## Life Stages

| Stage | Levels | XP per level | Emoji |
|---|---|---|---|
| Baby  | 1–5   | 100  | 🍼 |
| Child | 6–15  | 250  | 🌱 |
| Teen  | 16–30 | 500  | ⚡ |
| Adult | 31+   | 1000 | 👑 |

## Streak Multipliers

| Streak | Multiplier | Daily XP | Daily Treats |
|---|---|---|---|
| 1–6 days   | ×1   | 50 | 5  |
| 7–29 days  | ×1.5 | 75 | 8  |
| 30+ days   | ×2   | 100 | 10 |

## Adding New Commands

1. Create `commands/<name>.js` exporting `{ data: SlashCommandBuilder, async execute(interaction) }`.
2. Run `npm run deploy` to register the new command schema with Discord.
   `index.js` auto-loads all `.js` files in `commands/` — no manual registration needed there.

## Testing

```bash
npm test
```

266 tests across 7 suites (all passing). Note: `mockInteraction.js` includes a default `user: { id: 'user-123', displayName: 'TestUser' }` field. Tests use an in-memory SQLite database via `TEST_DB_PATH=:memory:` so they never touch `pets.db` on disk. Time-based tests (decay, streak) use Jest fake timers.

## Resolved Issues

- **Issue 001** — DM guard: bot now rejects all `/pet` commands sent via DM (`guildId` null check at top of `execute()`).
- **Issue 002** — Bot crash on expired interaction: error handler reply is now wrapped in a second try/catch so a failed followUp no longer throws an unhandled error that kills the process.
- **Issue 003** — Deprecation warnings: replaced `ephemeral: true` with `MessageFlags.Ephemeral`, renamed `ready` event to `clientReady`, and added a `client.on('error')` handler.
- **Issue 004** — `better-sqlite3` native binding failure on Node.js v26: upgraded from v9.6.0 to v12.x which supports Node 26.
- **Issue 005** — Stats were permanently frozen at their initial values; stat decay now reduces hunger/mood/energy/cleanliness over time via `applyDecay()`.
- **Issue 006** — No way to rename a pet after adoption; `/pet rename` now allows the server to update the pet's name at any time.
- **Issue 007** — Mood state system: `getMoodState(pet, now)` derives a visible mood label and emoji (Sick/Grumpy/Sleepy/Sad/Lonely/Bored/Happy/Content) from current stats and time since last interaction. Displayed in the status embed description.
- **Issue 008** — `/pet daily` command: once per UTC day per server, awards XP and treats (scaled by streak). Cooldown reply shows hours/minutes until next reset.
- **Issue 009** — Shop system: `SHOP_ITEMS` defined in `pet.js`; `spendTreats()` in `db.js`. `/pet shop` shows browse embed with balance. `/pet buy` spends treats and applies premium effects immediately.
- **Issue 010** — Life stages: `xpToNextLevel()` uses tiered thresholds (Baby 100, Child 250, Teen 500, Adult 1000). `getLifeStage(level)` maps level to a label and emoji shown in the status embed description.
- **Issue 011** — Streak system: consecutive UTC-day `/daily` claims increment a streak counter; missing a day resets it to 1. Rewards scale with `streakMultiplier()` (×1.5 at 7 days, ×2 at 30 days). Streak visible in daily reply and status embed.
- **Issue 012** — Daily tasks: 3 random tasks generated per guild per UTC day from a 10-task pool (feed/play/clean/sleep/daily/buy variants). `/pet tasks` shows ✅/🔲 progress embed. Completing a task auto-awards 5–10 treats + XP inline with the action reply. Tasks stored in `daily_tasks` table; rolled over at UTC midnight.
- **Issue 014** — Badge system: 15 permanent per-user badges tracked in `achievements` table. Badges are checked automatically after every action and awarded inline. `/pet badges` shows ✅ earned (with date) and 🔒 locked (with hint). Pets table gains `feed_count`, `play_count`, `items_bought_count`, `treats_spent_total` counter columns to support badge conditions.
- **Issue 013** — Inventory system: `/pet buy` now stores items in a per-user per-guild `inventory` table instead of applying them instantly. `/pet inventory` shows your stored items with quantities. `/pet use` consumes one item and applies its effects to the server pet.

## Planned Features

**Issue 013 — Inventory System**
Shop items can be stored rather than immediately used. Tracks items held per user via an `inventory` table keyed by `(guild_id, user_id)`. Commands:
- `/pet inventory` — view your stored items
- `/pet use item:<name>` — apply a stored item to the server pet
Buying from the shop adds to inventory instead of applying instantly.

**Issue 014 — Achievement & Badge System**
Milestones unlock badges permanently per user. Planned badges:
- 🍖 **First Meal** — feed the pet for the first time
- 🛁 **Spa Day** — clean the pet 7 days in a row
- 💀 **Survivor** — keep the pet alive for 30 days
- 💸 **Big Spender** — spend 100 treats total in the shop
- 💰 **Hoarder** — accumulate 50 treats at once
- 🎮 **Playful** — play with the pet 10 times
Requires an `achievements` table tracking `(guild_id, user_id, achievement_key, earned_at)`.

**Issue 015 — User Profile**
A `/pet profile` command (optionally `/pet profile user:@someone`) that displays a user's earned badges as a visual embed — their trophy case. Depends on Issue 014. Badge display should show earned date and a brief description for each unlocked achievement.

**Issue 016 — Server vs Personal Pet Mode**
Currently every server has one shared pet all members interact with together. This issue adds the option for each user to have their own personal pet. Would require a `mode` setting per guild (shared vs personal) and tracking pets by `(guild_id, user_id)` in personal mode. A server admin command would toggle the mode.
