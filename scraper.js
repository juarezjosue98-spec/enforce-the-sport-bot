const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.boxingnews24.com';

// Returns a list of { headline, url } from the homepage
async function scrapeHeadlines() {
  const { data: homepageHtml } = await axios.get(BASE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BoxingBotScraper/1.0)' },
    timeout: 10000,
  });

  const $ = cheerio.load(homepageHtml);
  const articles = [];

  $('h2.entry-title a, h3.entry-title a').each((i, el) => {
    const headline = $(el).text().trim();
    const url = $(el).attr('href');
    if (headline && url && url.startsWith('http')) {
      articles.push({ headline, url });
    }
  });

  if (articles.length === 0) {
    $('article a[rel="bookmark"]').each((i, el) => {
      const headline = $(el).text().trim();
      const url = $(el).attr('href');
      if (headline && url) articles.push({ headline, url });
    });
  }

  if (articles.length === 0) throw new Error('Could not find any articles on BoxingNews24 homepage.');

  return articles.slice(0, 10); // Return top 10
}

// Fetches the full article body from a given URL
async function scrapeArticleByUrl(url) {
  const { data: articleHtml } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BoxingBotScraper/1.0)' },
    timeout: 10000,
  });

  const $ = cheerio.load(articleHtml);
  const paragraphs = [];

  $('div.entry-content p').each((i, el) => {
    const text = $(el).text().trim();
    if (
      text.length > 40 &&
      !text.includes('Click here to subscribe') &&
      !text.includes('Boxing News 24 ©') &&
      !text.includes('affiliate commission')
    ) {
      paragraphs.push(text);
    }
  });

  const publishedAt =
    $('time.entry-date').attr('datetime') ||
    $('time').attr('datetime') ||
    new Date().toISOString();

  if (paragraphs.length === 0) throw new Error(`Could not extract article body from: ${url}`);

  return { url, fullText: paragraphs.join('\n\n'), publishedAt };
}

module.exports = { scrapeHeadlines, scrapeArticleByUrl };
