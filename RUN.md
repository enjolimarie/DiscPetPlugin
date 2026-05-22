# Running DiscPlugin Locally

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm (comes with Node.js)
- A Discord account and a server where you have **Manage Server** permissions

---

## 1. Create a Discord Application & Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. Give it a name, then open the **Bot** tab on the left.
3. Click **Add Bot** → confirm.
4. Under **Token**, click **Reset Token**, then copy the token — you'll need it shortly.
5. Under **Privileged Gateway Intents**, no extra intents are required for this bot.
6. Open the **OAuth2 → URL Generator** tab:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Use Slash Commands`
7. Copy the generated URL and open it in your browser to invite the bot to your server.

> **Keep your token secret.** Never commit it to git.

---

## 2. Install Dependencies

```bash
git clone <your-repo-url>
cd DiscPlugin
npm install
```

> `better-sqlite3` compiles a native addon. You may need Python and a C++ build toolchain installed.  
> On macOS: `xcode-select --install`  
> On Windows: install [windows-build-tools](https://www.npmjs.com/package/windows-build-tools) or VS Build Tools.

---

## 3. Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in the values:

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_id_here   # Found on the General Information page

# Optional — set during development for instant command registration to one server
# GUILD_ID=your_test_server_id_here
```

To find your **Application ID**: open the Developer Portal → your app → **General Information** → copy **Application ID**.  
To find your **Guild/Server ID**: enable Developer Mode in Discord settings, then right-click your server icon → **Copy Server ID**.

---

## 4. Register Slash Commands

Run this **once** (and again whenever you add or change commands):

```bash
npm run deploy
```

- With `GUILD_ID` set: commands appear in that server **instantly** (recommended for development).
- Without `GUILD_ID`: commands are registered globally and can take **up to 1 hour** to propagate.

---

## 5. Run the Bot

```bash
npm start
```

You should see `Ready! Logged in as <BotName>#0000` in the console. The bot will create `pets.db` in the project root on first run.
