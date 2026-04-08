const axios = require('axios');

/**
 * Sends article text through aihumanize.io API.
 * Model options: "0" = quality, "1" = balance, "2" = enhanced
 * Returns humanized text string, or original text if API fails.
 */
async function humanizeText(text) {
  const apiKey = process.env.AIHUMANIZE_API_KEY;
  const email = process.env.AIHUMANIZE_EMAIL;

  if (!apiKey || !email) {
    console.warn('⚠️  AIHUMANIZE_API_KEY or AIHUMANIZE_EMAIL not set — skipping humanization.');
    return text;
  }

  try {
    const response = await axios.post(
      'https://aihumanize.io/api/v1/rewrite',
      {
        model: '0',   // 0 = quality (best output)
        mail: email,
        data: text,
      },
      {
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    if (response.data?.code === 200 && response.data?.data) {
      console.log(`✅ Humanized — words used: ${response.data.words_used}, remaining: ${response.data.remaining_words}`);
      return response.data.data;
    } else {
      console.warn('⚠️  aihumanize.io returned unexpected response:', response.data);
      return text;
    }
  } catch (err) {
    console.error('❌ aihumanize.io API error:', err.message);
    return text; // Always fall back to original so bot doesn't crash
  }
}

module.exports = { humanizeText };
