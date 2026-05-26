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
- **`database/db.js`** — Opens `pets.db`, creates the `pets` table if needed, and exports synchronous helper functions. All stat values go through `clamp()`. XP leveling uses `xpToNextLevel(level) = level * 100`.

## Implemented Commands

| Command | Description |
|---|---|
| `/pet adopt` | Adopt a new pet (name + species). One per server. Supports custom species. |
| `/pet status` | Display current stats, level, and XP progress bar. Color-coded by average health. |
| `/pet remove` | Permanently remove the server's pet. Requires typing the pet's name to confirm. |
| `/pet feed` | Hunger +20, XP +10. Shows updated status embed. |
| `/pet play` | Mood +15, Energy -10, XP +10. Shows updated status embed. |
| `/pet clean` | Cleanliness +20, Mood -5, XP +10. Shows updated status embed. |
| `/pet sleep` | Energy +30, Mood -5, XP +5. Shows updated status embed. |
| `/pet rename` | Give the server pet a new name. |

## Database Layer (`database/db.js`)

| Function | Description |
|---|---|
| `getPet(guildId)` | Returns the pet row or undefined. |
| `createPet(guildId, name, species)` | Inserts a new pet with all stats at 80. |
| `deletePet(guildId)` | Removes the pet row. |
| `renamePet(guildId, newName)` | Updates the pet's name and returns the updated row. |
| `updateStat(guildId, stat, delta)` | Applies a delta to one stat column, clamped to [0, 100]. |
| `addXP(guildId, amount)` | Adds XP and triggers level-ups. Excess XP carries over. |
| `xpToNextLevel(level)` | Returns `level * 100` — XP needed to advance from `level` to `level + 1`. |
| `clamp(val)` | Clamps and rounds a value to [0, 100]. |

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

Stats are always clamped to `[0, 100]`. Use `clamp()` from `database/db.js` whenever writing a stat.

## Adding New Commands

1. Create `commands/<name>.js` exporting `{ data: SlashCommandBuilder, async execute(interaction) }`.
2. Run `npm run deploy` to register the new command schema with Discord.
   `index.js` auto-loads all `.js` files in `commands/` — no manual registration needed there.

## Testing

```bash
npm test
```

135 tests across 6 suites (all passing). Tests use an in-memory SQLite database via `TEST_DB_PATH=:memory:` so they never touch `pets.db` on disk.

## Resolved Issues

- **Issue 001** — DM guard: bot now rejects all `/pet` commands sent via DM (`guildId` null check at top of `execute()`).
- **Issue 002** — Bot crash on expired interaction: error handler reply is now wrapped in a second try/catch so a failed followUp no longer throws an unhandled error that kills the process.
- **Issue 003** — Deprecation warnings: replaced `ephemeral: true` with `MessageFlags.Ephemeral`, renamed `ready` event to `clientReady`, and added a `client.on('error')` handler.
- **Issue 004** — `better-sqlite3` native binding failure on Node.js v26: upgraded from v9.6.0 to v12.x which supports Node 26.
- **Issue 005** — Stats were permanently frozen at their initial values; stat decay now reduces hunger/mood/energy/cleanliness over time.
- **Issue 006** — No way to rename a pet after adoption; `/pet rename` now allows the server to update the pet's name at any time.

## Planned Features (TODOs)

No outstanding TODOs at this time.
