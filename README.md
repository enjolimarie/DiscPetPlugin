# DiscPlugin — Discord Server Pet Bot

A Discord bot where each server adopts and cares for one shared virtual pet. All members of a server interact with the same pet together.

Built with **discord.js v14** and **better-sqlite3**.

> For installation and setup instructions, see [RUN.md](RUN.md).

---

## Features

- Each Discord server has **one shared pet** — a communal creature the whole server looks after.
- **Adopt** a pet with a custom name and species (10 built-in species or a custom one of your choosing).
- **Check status** at any time via a formatted embed showing hunger, mood, energy, and cleanliness as visual progress bars, plus level and XP.
- Stat values are always kept in the range **0–100**.
- Embed color reflects overall health: green (healthy), yellow (needs attention), red (critical).

---

## Commands

| Command | Description |
|---|---|
| `/pet adopt name:<string> species:<choice> [custom_species:<string>]` | Adopt a pet for this server (one per server) |
| `/pet status` | Display the server pet's current stats |

### Species choices

`cat`, `dog`, `fish`, `chameleon`, `hedgehog`, `hamster`, `mouse`, `gerbil`, `guinea pig`, `rabbit`, `custom`

When `custom` is selected, `custom_species` is required.

---

## Project Structure

```
DiscPlugin/
├── commands/
│   └── pet.js           # /pet subcommands (adopt, status)
├── database/
│   └── db.js            # SQLite init + pet query helpers
├── index.js             # Bot entry point, command dispatcher
├── deploy-commands.js   # One-shot command registration script
├── .env.example         # Environment variable template
└── pets.db              # Created automatically at runtime (git-ignored)
```
