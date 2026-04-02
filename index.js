require('dotenv').config();
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { scrapeHeadlines, scrapeArticleByUrl } = require('./scraper');
const { generateArticle } = require('./claude');
const { buildDocx } = require('./docx');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Store pending selections per user: userId -> [{ headline, url }, ...]
const pendingSelections = new Map();

client.once('ready', () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.mentions.has(client.user)) return;

  const content = message.content.replace(/<@!?\d+>/g, '').trim().toLowerCase();

  // --- Step 1: Scrape and list headlines ---
  const wantsScrape =
    content.includes('scrape') ||
    content.includes('news') ||
    content.includes('latest') ||
    content.includes('article') ||
    content.includes('write');

  if (wantsScrape && !pendingSelections.has(message.author.id)) {
    const statusMsg = await message.reply('🥊 Scraping the latest from BoxingNews24... one moment.');
    try {
      const articles = await scrapeHeadlines();
      pendingSelections.set(message.author.id, articles);
      const list = articles.map((a, i) => `**${i + 1}.** ${a.headline}`).join('\n');
      await statusMsg.edit(`📰 Here are the latest stories. Reply with a number to write an article:\n\n${list}`);
    } catch (err) {
      await statusMsg.edit(`❌ Error scraping headlines: \`${err.message}\``);
    }
    return;
  }

  // --- Step 2: User picks a number ---
  const pick = parseInt(content);
  if (!isNaN(pick) && pendingSelections.has(message.author.id)) {
    const articles = pendingSelections.get(message.author.id);

    if (pick < 1 || pick > articles.length) {
      await message.reply(`Please pick a number between 1 and ${articles.length}.`);
      return;
    }

    const chosen = articles[pick - 1];
    pendingSelections.delete(message.author.id);

    const statusMsg = await message.reply(`📰 Got it — writing on: **${chosen.headline}**`);

    try {
      const { fullText, publishedAt, url } = await scrapeArticleByUrl(chosen.url);
      await statusMsg.edit('✍️ Generating article...');

      const story = { headline: chosen.headline, url, fullText, publishedAt };
      const articleText = await generateArticle(story);
      await statusMsg.edit('📄 Building your files...');

      const docxBuffer = await buildDocx({
        ...articleText,
        fullText: articleText.linkedText || articleText.fullText,
      });

      const plainText = [
        articleText.title,
        `By ${articleText.byline}`,
        '',
        (articleText.fullText || '')
          .replace(/<a [^>]+>([^<]+)<\/a>/g, '$1')
          .replace(/<[^>]+>/g, '')
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

      const preview = plainText.slice(0, 1500);
      await message.channel.send({
        content: `**${articleText.title}**\n*By ${articleText.byline}*\n\n${preview}\n\n*...full article in files below*`,
      });

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
      await statusMsg.edit(`❌ Something went wrong: \`${err.message}\` — please try again.`);
    }
    return;
  }

  // --- Fallback ---
  await message.reply("Hey! Mention me with **write me an article**, **latest news**, or **article** to get started.");
});

client.login(process.env.DISCORD_TOKEN);
