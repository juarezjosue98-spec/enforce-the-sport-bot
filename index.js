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
  if (message.author.bot) return;
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

  const statusMsg = await message.reply(
    '🥊 Scraping the latest from BoxingNews24... one moment.'
  );

  try {
    // 1. Scrape freshest story
    const story = await scrapeLatestStory();
    await statusMsg.edit(
      `📰 Got it — writing on: **${story.headline}**`
    );

    // 2. Generate article + Tapology links via Claude API
    const articleText = await generateArticle(story);
    await statusMsg.edit('📄 Building your .docx file...');

    // 3. Build .docx — use linkedText so hyperlinks are embedded in the doc
    const docxBuffer = await buildDocx({
      ...articleText,
      fullText: articleText.linkedText || articleText.fullText,
    });

    // 4. Post plain text preview in Discord (strip HTML tags for readability)
    const plainPreview = (articleText.linkedText || articleText.fullText)
      .replace(/<a [^>]+>([^<]+)<\/a>/g, '$1') // strip <a> tags, keep text
      .slice(0, 1800);

    await statusMsg.edit('✅ Done! Here\'s your article:');

    await message.channel.send({
      content: `**${articleText.title}**\n*By ${articleText.byline}*\n\n${plainPreview}\n\n*...continued in the .docx file*`,
    });

    // 5. Upload .docx
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
