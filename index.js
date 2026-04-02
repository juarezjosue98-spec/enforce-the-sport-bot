const { scrapeHeadlines, scrapeArticleByUrl } = require('./scraper');

// Store pending selections per user: userId -> [{ headline, url }, ...]
const pendingSelections = new Map();

client.on('messageCreate', async (message) => {
  if (!message.mentions.has(client.user)) return;
  if (message.author.bot) return;

  const content = message.content.replace(/<@!?\d+>/g, '').trim().toLowerCase();

  // --- Step 1: User says "scrape" or "news" ---
  if (content.includes('scrape') || content.includes('news')) {
    try {
      await message.reply('Fetching latest headlines from BoxingNews24...');
      const articles = await scrapeHeadlines();
      pendingSelections.set(message.author.id, articles);

      const list = articles
        .map((a, i) => `**${i + 1}.** ${a.headline}`)
        .join('\n');

      await message.reply(`Here are the latest stories. Reply with a number to write an article:\n\n${list}`);
    } catch (err) {
      await message.reply(`Error scraping headlines: ${err.message}`);
    }
    return;
  }

  // --- Step 2: User replies with a number to select a story ---
  const pick = parseInt(content);
  if (!isNaN(pick) && pendingSelections.has(message.author.id)) {
    const articles = pendingSelections.get(message.author.id);

    if (pick < 1 || pick > articles.length) {
      await message.reply(`Please pick a number between 1 and ${articles.length}.`);
      return;
    }

    const chosen = articles[pick - 1];
    pendingSelections.delete(message.author.id);

    try {
      await message.reply(`Got it — writing article on: **${chosen.headline}**...`);
      const { fullText, publishedAt, url } = await scrapeArticleByUrl(chosen.url);

      // Pass to your existing Claude + docx pipeline
      const docBuffer = await generateArticle({ headline: chosen.headline, url, fullText, publishedAt });
      await message.reply({ files: [{ attachment: docBuffer, name: 'article.docx' }] });
    } catch (err) {
      await message.reply(`Error generating article: ${err.message}`);
    }
    return;
  }
});
