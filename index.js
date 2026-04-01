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
    // 1. Scrape
    const story = await scrapeLatestStory();
    await statusMsg.edit(`📰 Got it — writing on: **${story.headline}**`);

    // 2. Generate article
    const articleText = await generateArticle(story);
    await statusMsg.edit('📄 Building your files...');

    // 3. Build .docx
    const docxBuffer = await buildDocx({
      ...articleText,
      fullText: articleText.linkedText || articleText.fullText,
    });

    // 4. Build plain .txt — strip all HTML tags, clean and copyable
    const plainText = [
      articleText.title,
      `By ${articleText.byline}`,
      '',
      (articleText.fullText || '')
        .replace(/<a [^>]+>([^<]+)<\/a>/g, '$1') // strip hyperlinks, keep names
        .replace(/<[^>]+>/g, '')                  // strip any other HTML
        .trim(),
      '',
      `Tags: ${articleText.tags || ''}`,
    ].join('\n');

    const safeTitle = articleText.title
      .replace(/[^a-z0-9 ]/gi, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 60);

    await statusMsg.edit('✅ Done! Here\'s your article:');

    // 5. Post short preview in Discord
    const preview = plainText.slice(0, 1500);
    await message.channel.send({
      content: `**${articleText.title}**\n*By ${articleText.byline}*\n\n${preview}\n\n*...full article in files below*`,
    });

    // 6. Send BOTH files together
    await message.channel.send({
      content: '📎 **Your article files — .txt is fully copyable into Google Docs:**',
      files: [
        new AttachmentBuilder(Buffer.from(plainText, 'utf-8'), {
          name: `${safeTitle}.txt`,
        }),
        new AttachmentBuilder(docxBuffer, {
          name: `${safeTitle}.docx`,
        }),
      ],
    });

  } catch (err) {
    console.error(err);
    await statusMsg.edit(
      `❌ Something went wrong: \`${err.message}\` — please try again.`
    );
  }
});

client.login(process.env.DISCORD_TOKEN);
