# Issue 002 — Pet name not length-validated; long names exceed Discord embed title limit

**File:** `commands/pet.js` ~line 82  
**Severity:** High  
**Status:** Open

## Description

The `name` option on `/pet adopt` has no `setMaxLength()` constraint in the `SlashCommandBuilder`. Discord allows slash command string inputs up to 6 000 characters. The name is stored verbatim in the database and later placed into an `EmbedBuilder.setTitle()` call.

Discord enforces a **256-character limit** on embed titles. When the full title string (emoji + name + " has been adopted!") exceeds 256 characters, the Discord API rejects the response with a `400 Bad Request`. The same problem occurs in `/pet status` where `pet_name` is used as the embed title.

The same issue applies to `custom_species`, which can also be arbitrarily long and appears inside the embed title and description.

## Steps to Reproduce

1. Run `/pet adopt name:<257+ character string> species:cat`.
2. The name is written to the database successfully.
3. The bot attempts to reply with an embed — the Discord API returns a 400 error and the interaction is answered with the generic error message instead.
4. `/pet status` also fails permanently for that server because `pet_name` from the DB is still too long.

## Fix

Add `.setMaxLength()` to the `name` and `custom_species` options in the `SlashCommandBuilder`:

```js
opt.setName('name').setDescription('Give your pet a name').setRequired(true).setMaxLength(64)
opt.setName('custom_species').setDescription('...').setMaxLength(32)
```

This enforces the limit at the Discord client level before the interaction ever reaches the bot.
