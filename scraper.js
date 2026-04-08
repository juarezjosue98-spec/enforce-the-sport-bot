const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.boxingnews24.com';

/**
 * Scrapes the BoxingNews24 homepage for the latest article,
 * then fetches the full article text from that URL.
 *
 * Returns: { headline, url, fullText, publishedAt }
 */
async function scrapeLatestStory() {
  // 1. Fetch homepage
  const { data: homepageHtml } = await axios.get(BASE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BoxingBotScraper/1.0)' },
    timeout: 10000,
  });

  const $ = cheerio.load(homepageHtml);

  // Grab the first article link from the main feed
  // BoxingNews24 uses <h2 class="entry-title"> for article headlines
  const articles = [];

  $('h2.entry-title a, h3.entry-title a').each((i, el) => {
    const headline = $(el).text().trim();
    const url = $(el).attr('href');
    if (headline && url && url.startsWith('http')) {
      articles.push({ headline, url });
    }
  });

  // Fallback: grab any article links in the main content area
  if (articles.length === 0) {
    $('article a[rel="bookmark"]').each((i, el) => {
      const headline = $(el).text().trim();
      const url = $(el).attr('href');
      if (headline && url) {
        articles.push({ headline, url });
      }
    });
  }

  if (articles.length === 0) {
    throw new Error('Could not find any articles on BoxingNews24 homepage.');
  }

  // Pick the very first (most recent) article
  const latest = articles[0];

  // 2. Fetch the full article page
  const { data: articleHtml } = await axios.get(latest.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BoxingBotScraper/1.0)' },
    timeout: 10000,
  });

  const $$ = cheerio.load(articleHtml);

  // Extract article body paragraphs
  const paragraphs = [];
  $$('div.entry-content p').each((i, el) => {
    const text = $$(el).text().trim();
    // Skip empty paragraphs and boilerplate lines
    if (
      text.length > 40 &&
      !text.includes('Click here to subscribe') &&
      !text.includes('Boxing News 24 ©') &&
      !text.includes('affiliate commission')
    ) {
      paragraphs.push(text);
    }
  });

  // Extract published date if available
  const publishedAt =
    $$('time.entry-date').attr('datetime') ||
    $$('time').attr('datetime') ||
    new Date().toISOString();

  if (paragraphs.length === 0) {
    throw new Error(`Could not extract article body from: ${latest.url}`);
  }

  return {
    headline: latest.headline,
    url: latest.url,
    fullText: paragraphs.join('\n\n'),
    publishedAt,
  };
}

module.exports = { scrapeLatestStory };
