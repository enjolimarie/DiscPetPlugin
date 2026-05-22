require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const { data } = require(path.join(commandsPath, file));
  if (data) commands.push(data.toJSON());
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Registering ${commands.length} slash command(s)...`);

    if (process.env.GUILD_ID) {
      // Guild-scoped: registers instantly, ideal for development
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands },
      );
      console.log('Guild commands registered (instant).');
    } else {
      // Global: can take up to 1 hour to propagate
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands },
      );
      console.log('Global commands registered (up to 1 hour to propagate).');
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
