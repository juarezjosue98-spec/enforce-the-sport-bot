require('dotenv').config();
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { scrapeHeadlines, scrapeFullArticle } = require('./scraper');
const { generateArticle } = require('./claude');
const { generatePreview } = require('./preview');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Store pending story selections per user
const pendingSelections = new Map();

client.once('ready', () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  const text = message.content.trim();

  // ── STEP 2: User replies with a number to pick a story ──
  if (pendingSelections.has(userId)) {
    const num = parseInt(text, 10);
    const headlines = pendingSelections.get(userId);

    if (!isNaN(num) && num >= 1 && num <= headlines.length) {
      pendingSelections.delete(userId);
      const chosen = headlines[num - 1];

      const statusMsg = await message.reply(
        `✍️ Writing article on: **${chosen.headline}**`
      );

      try {
        const story = await scrapeFullArticle(chosen.headline, chosen.url);
        await statusMsg.edit('🧠 Generating article...');

        const articleText = await generateArticle(story);

        const cleanBody = (articleText.fullText || '')
          .replace(/<a [^>]+>([^<]+)<\/a>/g, '$1')
          .replace(/<[^>]+>/g, '')
          .trim();

        await statusMsg.edit('✅ Done!');
        await deliverArticle(message, articleText.title, articleText.byline, cleanBody, articleText.tags);

      } catch (err) {
        console.error(err);
        await statusMsg.edit(`❌ Something went wrong: \`${err.message}\``);
      }
      return;

    } else {
      return message.reply(`Please reply with a number between 1 and ${headlines.length}.`);
    }
  }

  // ── Only respond to mentions from here ──
  if (!message.mentions.has(client.user)) return;

  const content = text.toLowerCase();

  // ── PREVIEW TRIGGER: "@bot write me a preview X vs Y" ──
  const previewMatch = content.match(/preview\s+(.+?)\s+vs\.?\s+(.+)/i) ||
                       text.match(/preview\s+(.+?)\s+vs\.?\s+(.+)/i);

  if (previewMatch) {
    const fighterA = previewMatch[1].trim();
    const fighterB = previewMatch[2].trim();

    const statusMsg = await message.reply(
      `🔍 Searching for **${fighterA} vs ${fighterB}** stats and fight details...`
    );

    try {
      await statusMsg.edit(`📊 Got the data — writing your ETS preview...`);
      const preview = await generatePreview(fighterA, fighterB);

      const cleanBody = (preview.fullText || '')
        .replace(/<a [^>]+>([^<]+)<\/a>/g, '$1')
        .replace(/<[^>]+>/g, '')
        .trim();

      await statusMsg.edit('✅ Done!');
      await deliverArticle(message, preview.title, preview.byline, cleanBody, preview.tags);

    } catch (err) {
      console.error(err);
      await statusMsg.edit(`❌ Something went wrong: \`${err.message}\``);
    }
    return;
  }

  // ── ARTICLE TRIGGER: "@bot write me an article" ──
  const wantsArticle =
    content.includes('write') ||
    content.includes('article') ||
    content.includes('news') ||
    content.includes('latest');

  if (!wantsArticle) {
    return message.reply(
      'Hey! Try:\n• `@bot write me an article` — pick from latest BoxingNews24 stories\n• `@bot write me a preview Canelo vs Munguia` — full ETS fight preview'
    );
  }

  const statusMsg = await message.reply('🥊 Scraping the latest from BoxingNews24...');

  try {
    const headlines = await scrapeHeadlines();
    pendingSelections.set(userId, headlines);

    const list = headlines
      .map((h, i) => `**${i + 1}.** ${h.headline}`)
      .join('\n');

    await statusMsg.edit(
      `📋 **Here are the latest 10 stories — reply with a number to pick one:**\n\n${list}`
    );

  } catch (err) {
    console.error(err);
    await statusMsg.edit(`❌ Something went wrong: \`${err.message}\``);
  }
});

/**
 * Delivers article as chunked Discord messages + .txt attachment
 */
async function deliverArticle(message, title, byline, bodyText, tags) {
  const fullPlainText = [
    title,
    `By ${byline}`,
    '',
    bodyText,
    '',
    `Tags: ${tags || ''}`,
  ].join('\n');

  const safeTitle = title
    .replace(/[^a-z0-9 ]/gi, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);

  // Post in chunks
  const chunks = [];
  const paragraphs = bodyText.split('\n\n');
  let current = `**${title}**\n*By ${byline}*\n\n`;

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

  await message.channel.send({
    content: '📎 **Full article as .txt — copy into Google Docs:**',
    files: [
      new AttachmentBuilder(Buffer.from(fullPlainText, 'utf-8'), {
        name: `${safeTitle}.txt`,
      }),
    ],
  });
}

client.login(process.env.DISCORD_TOKEN);
