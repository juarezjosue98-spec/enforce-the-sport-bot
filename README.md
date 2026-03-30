# EnforceTheSport Boxing Bot

Scrapes the latest story from BoxingNews24, generates a polished SEO article via Claude, and delivers a text preview + .docx file directly in Discord.

---

## How It Works

1. You mention the bot in any channel: `@Claude write me an article`
2. Bot scrapes BoxingNews24 for the freshest headline *at that exact moment*
3. Full article text is pulled from that URL
4. Claude API generates a formatted essay-style article (your exact style)
5. Bot posts a text preview + uploads the `.docx` to the channel

---

## Step 1 — Create Your Discord Bot

1. Go to https://discord.com/developers/applications
2. Click **New Application** → name it (e.g. `EnforceTheSport`)
3. Go to **Bot** tab → click **Add Bot**
4. Under **Privileged Gateway Intents**, enable:
   - ✅ **Message Content Intent**
   - ✅ **Server Members Intent**
5. Copy your **Bot Token** — save it, you'll need it shortly
6. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`
   - Bot Permissions: `Send Messages`, `Read Message History`, `Attach Files`, `Mention Everyone`
7. Copy the generated URL, open it in your browser, and invite the bot to your server

---

## Step 2 — Get Your Anthropic API Key

1. Go to https://console.anthropic.com/settings/keys
2. Click **Create Key**
3. Copy the key — you only see it once

---

## Step 3 — Deploy to Railway

### Option A: Deploy via GitHub (recommended)

1. Push this folder to a new GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   gh repo create enforce-the-sport-bot --private --push
   ```

2. Go to https://railway.app → **New Project → Deploy from GitHub repo**
3. Select your repo
4. Railway auto-detects Node.js and runs `npm install` + `node index.js`

### Option B: Deploy via Railway CLI

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

---

## Step 4 — Add Environment Variables in Railway

In your Railway project dashboard:

1. Click your service → **Variables** tab
2. Add these two variables:

| Variable | Value |
|---|---|
| `DISCORD_TOKEN` | Your Discord bot token from Step 1 |
| `ANTHROPIC_API_KEY` | Your Anthropic API key from Step 2 |

Railway automatically restarts the bot after you save variables.

---

## Step 5 — Test It

In your Discord server, mention the bot:

```
@EnforceTheSport write me an article
```

You'll see it respond with status updates as it works, then deliver:
- 📝 A full text preview in the channel
- 📎 A `.docx` file download attachment

---

## Usage Examples

Any message mentioning the bot that contains these words will trigger an article:
- `write`, `article`, `news`, `latest`

```
@EnforceTheSport write me an article
@EnforceTheSport latest news
@EnforceTheSport get the news and write
```

Anything else gets a friendly help message.

---

## File Structure

```
boxing-bot/
├── index.js          # Discord bot, message handling
├── scraper.js        # Scrapes BoxingNews24 homepage + article body
├── claude.js         # Calls Claude API, returns structured article JSON
├── docx.js           # Builds .docx in EnforceTheSport format
├── package.json      # Dependencies
├── railway.toml      # Railway deploy config
├── .env.example      # Environment variable template
└── .gitignore
```

---

## Local Development

```bash
cp .env.example .env
# Fill in DISCORD_TOKEN and ANTHROPIC_API_KEY in .env

npm install
npm run dev
```

---

## Troubleshooting

**Bot is online but not responding**
→ Make sure **Message Content Intent** is enabled in the Discord Developer Portal (Step 1)

**"Could not find any articles" error**
→ BoxingNews24 may have changed their HTML structure. Open `scraper.js` and update the CSS selectors in the `$('h2.entry-title a')` line to match the current page.

**Railway shows "crashed" status**
→ Check the Railway logs tab. Usually a missing environment variable. Confirm both `DISCORD_TOKEN` and `ANTHROPIC_API_KEY` are set.

**Discord says file too large**
→ Free Discord servers have an 8MB upload limit. Boxing articles are well under 1MB so this shouldn't occur, but if it does, upgrade your Discord server to boost tier.
