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

- **`index.js`** — Creates the `Client`, auto-loads all files from `commands/` into a `Collection`, and dispatches `interactionCreate` events to the matching command's `execute()`.
- **`deploy-commands.js`** — One-shot script that POSTs slash command schemas to Discord's REST API. Set `GUILD_ID` for instant guild-scoped registration during development; omit for global.
- **`commands/pet.js`** — Defines the `/pet` command tree. Subcommands branch inside a single `execute()` on `interaction.options.getSubcommand()`.
- **`database/db.js`** — Opens `pets.db`, creates the `pets` table if needed, and exports synchronous helper functions. All stat values must go through `clamp()` before being written.

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

## Resolved Issues

- **Issue 001** — DM guard: bot now rejects `/pet` commands sent via DM (`guildId` null check at top of `execute()`).

## Planned Features (TODOs)

The following are stubbed with `// TODO` comments and not yet implemented:
- `database/db.js`: `updateStat(guildId, stat, delta)` — used by feed, play, clean, sleep
- `database/db.js`: `addXP(guildId, amount)` — XP gain + level-up logic
- `commands/pet.js` status embed: XP progress bar toward next level
- Future subcommands: `feed`, `play`, `clean`, `sleep`, `rename`
