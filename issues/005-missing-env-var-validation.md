# Issue 005 — Missing environment variable validation produces misleading startup errors

**Files:** `deploy-commands.js` line 13, `index.js` last line  
**Severity:** Low  
**Status:** Open

## Description

Neither `deploy-commands.js` nor `index.js` validates that required environment variables are defined before using them. Two distinct failure modes result:

**`deploy-commands.js`:** If `CLIENT_ID` is missing, `process.env.CLIENT_ID` is `undefined`. `Routes.applicationGuildCommands(undefined, guildId)` silently builds the URL path `/applications/undefined/guilds/.../commands`. The Discord API returns a `404` or `401`, and the operator sees a `DiscordAPIError` in the console rather than a clear `"CLIENT_ID is not set"` message.

**`index.js`:** If `DISCORD_TOKEN` is missing, `client.login(undefined)` is called. discord.js throws a `TokenInvalid` error with no indication that the environment variable is the root cause, making it harder to diagnose for first-time setup.

## Fix

Add a startup guard in both entry points before any Discord API calls:

```js
// At the top of deploy-commands.js and index.js
const REQUIRED_ENV = ['DISCORD_TOKEN', 'CLIENT_ID'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}
```
