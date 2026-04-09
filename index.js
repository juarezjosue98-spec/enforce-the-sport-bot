require('dotenv').config();
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { scrapeHeadlines, scrapeFullArticle } = require('./scraper');
const { generateArticle } = require('./claude');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Store pending selections per user
const pendingSelections = new Map();

client.once('ready', () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  const text = message.content.trim();

  // --- STEP 2: User replies with a number to pick a story ---
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

        // Strip HTML tags from body
        const cleanBody = (articleText.fullText || '')
          .replace(/<a [^>]+>([^<]+)<\/a>/g, '$1')
          .replace(/<[^>]+>/g, '')
          .trim();

        const fullPlainText = [
          articleText.title,
          `By ${articleText.byline}`,
          '',
          cleanBody,
          '',
          `Tags: ${articleText.tags || ''}`,
        ].join('\n');

        const safeTitle = articleText.title
          .replace(/[^a-z0-9 ]/gi, '')
          .trim()
          .replace(/\s+/g, '_')
          .slice(0, 60);

        await statusMsg.edit('✅ Done!');

        // Post in chunks so Discord doesn't cut it off
        const chunks = [];
        const paragraphs = cleanBody.split('\n\n');
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

        // .txt file attachment
        await message.channel.send({
          content: '📎 **Full article as .txt — copy into Google Docs:**',
          files: [
            new AttachmentBuilder(Buffer.from(fullPlainText, 'utf-8'), {
              name: `${safeTitle}.txt`,
            }),
          ],
        });

      } catch (err) {
        console.error(err);
        await statusMsg.edit(`❌ Something went wrong: \`${err.message}\``);
      }

      return;
    } else {
      return message.reply(
        `Please reply with a number between 1 and ${headlines.length}.`
      );
    }
  }

  // --- STEP 1: Bot is mentioned with article trigger ---
  if (!message.mentions.has(client.user)) return;

  const content = text.toLowerCase();
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

client.login(process.env.DISCORD_TOKEN);
