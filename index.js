require('dotenv').config();
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { scrapeLatestStory } = require('./scraper');
const { generateArticle } = require('./claude');
const { humanizeText } = require('./humanize');

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

    // 2. Generate article via Claude
    const articleText = await generateArticle(story);
    await statusMsg.edit('🧠 Running through humanizer...');

    // 3. Strip HTML tags from body before humanizing
    const plainBody = (articleText.fullText || '')
      .replace(/<a [^>]+>([^<]+)<\/a>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .trim();

    // 4. Run through aihumanize.io
    const humanizedBody = await humanizeText(plainBody);

    // 5. Build final clean text
    const fullPlainText = [
      articleText.title,
      `By ${articleText.byline}`,
      '',
      humanizedBody,
      '',
      `Tags: ${articleText.tags || ''}`,
    ].join('\n');

    const safeTitle = articleText.title
      .replace(/[^a-z0-9 ]/gi, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 60);

    await statusMsg.edit('✅ Done!');

    // 6. Post article in Discord as selectable chunks
    const chunks = [];
    const paragraphs = humanizedBody.split('\n\n');
    let current = `**${articleText.title}**\n*By ${articleText.byline}*\n\n`;

    for (const para of paragraphs) {
      if ((current + para + '\n\n').length > 1900) {
        chunks.push(current.trim());
        current = para + '\n\n';
      } else {
        current += para + '\n\n';
      }
    }
    if (current.trim()) chunks.push(current.trim());

    for (const chunk of chunks) {
      await message.channel.send({ content: chunk });
    }

    // 7. Also attach .txt file as backup
    const txtAttachment = new AttachmentBuilder(
      Buffer.from(fullPlainText, 'utf-8'),
      { name: `${safeTitle}.txt` }
    );

    await message.channel.send({
      content: '📎 **Full article as .txt — copy into Google Docs:**',
      files: [txtAttachment],
    });

  } catch (err) {
    console.error(err);
    await statusMsg.edit(
      `❌ Something went wrong: \`${err.message}\` — please try again.`
    );
  }
});

client.login(process.env.DISCORD_TOKEN);
