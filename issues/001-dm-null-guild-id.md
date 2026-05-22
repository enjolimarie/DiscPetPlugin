# Issue 001 — DM invocation passes null guildId into database calls

**File:** `commands/pet.js` ~line 75  
**Severity:** High  
**Status:** Open

## Description

`interaction.guildId` is `null` when a slash command is invoked inside a Direct Message. Because `SlashCommandBuilder` never calls `.setDMPermission(false)`, the `/pet` command is reachable in DMs by default.

`guildId` is captured on line 75 and passed directly into `getPet(guildId)` and `createPet(guildId, ...)` with no null guard. SQLite accepts a `NULL` `TEXT PRIMARY KEY`, so `createPet(null, ...)` successfully inserts an orphan row with `guild_id = NULL`. Any subsequent DM `/pet adopt` from any user then hits this orphan row via `getPet(null)` and sees a pet that belongs to no server.

## Steps to Reproduce

1. Invite the bot to a server.
2. DM the bot directly and run `/pet adopt name:Ghost species:cat`.
3. A pet row is inserted with `guild_id = NULL`.
4. Run `/pet adopt` again in any DM — the bot incorrectly reports the server already has a pet.

## Fix

Add an early guild guard at the top of `execute()`:

```js
if (!interaction.guildId) {
  return interaction.reply({ content: 'This command can only be used inside a server.', ephemeral: true });
}
```

Alternatively, add `.setDMPermission(false)` to the `SlashCommandBuilder` to prevent Discord from showing the command in DMs at all.
