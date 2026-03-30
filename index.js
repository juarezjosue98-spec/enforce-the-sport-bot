require('dotenv').config();
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { scrapeLatestStory } = require('./scraper');
const { generateArticle } = require('./claude');
const { buildDocx } = require('./docx');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  // Ignore bots
  if (message.author.bot) return;

  // Only respond when the bot is mentioned
  if (!message.mentions.has(client.user)) return;

  const content = message.content.toLowerCase();
  const wantsArticle =
    content.includes('write') ||
    content.includes('article') ||
    content.includes('news') ||
    content.includes('latest');

  if (!wantsArticle) {
    return message.reply(
      "Hey! Mention me with **write me an article**, **latest news**, or **article** to get started."
    );
  }

  // Acknowledge immediately so the user knows it's working
  const statusMsg = await message.reply(
    '🥊 Scraping the latest from BoxingNews24... one moment.'
  );

  try {
    // 1. Scrape freshest story
    await statusMsg.edit('📰 Got the headlines — picking the freshest story...');
    const story = await scrapeLatestStory();

    await statusMsg.edit(
      `✍️ Writing article on: **${story.headline}** — drafting now...`
    );

    // 2. Generate article via Claude API
    const articleText = await generateArticle(story);

    // 3. Build .docx
    await statusMsg.edit('📄 Building your .docx file...');
    const docxBuffer = await buildDocx(articleText);

    // 4. Post text preview (first ~1800 chars so Discord doesn't truncate)
    const preview = articleText.fullText.slice(0, 1800) + '\n\n*...continued in the .docx file*';

    await statusMsg.edit('✅ Done! Here\'s your article:');

    // Text preview embed
    await message.channel.send({
      content: `**${articleText.title}**\n*By ${articleText.byline}*\n\n${preview}`,
    });

    // .docx attachment
    const safeTitle = articleText.title
      .replace(/[^a-z0-9 ]/gi, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 60);

    const attachment = new AttachmentBuilder(docxBuffer, {
      name: `${safeTitle}.docx`,
    });

    await message.channel.send({
      content: '📎 **Download your .docx file:**',
      files: [attachment],
    });
  } catch (err) {
    console.error(err);
    await statusMsg.edit(
      `❌ Something went wrong: \`${err.message}\` — please try again.`
    );
  }
});

client.login(process.env.DISCORD_TOKEN);
