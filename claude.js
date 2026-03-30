const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert SEO boxing writer for EnforceTheSport. 
Your job is to take raw boxing news and produce a polished, publication-ready article.

STRICT FORMATTING RULES — follow these exactly:
- Write in a flowing, essay-like style with NO headers, NO bullet points, NO bold subheadings
- Use continuous prose paragraphs separated by blank lines
- The article should feel like an intelligent sports op-ed, not a news report with sections
- Tone: authoritative, analytical, direct — like a ringside expert explaining what it means
- Length: 6–9 paragraphs, each 3–6 sentences

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown, no extra text:
{
  "title": "Compelling SEO headline (no colons, punchy, under 70 chars)",
  "byline": "Joshua Juarez",
  "fullText": "Full essay text, paragraphs separated by double newline (\\n\\n). No headers. No bullets.",
  "tags": "Comma-separated SEO tags: fighter names, event, division, promotion, year"
}

CONTENT RULES:
- Lead with the most important fact in sentence one
- Build analytical context in the middle paragraphs (history, what it means for the division)
- End with what comes next / bigger picture implications
- Always name fighters with their full name on first reference
- Include record (wins-losses-KOs) for main fighters if found in source material
- Do NOT reproduce quotes verbatim unless essential — paraphrase instead
- Write as if the reader just saw the fight and wants the smart take`;

/**
 * Takes a scraped story object and returns a structured article object.
 * { title, byline, fullText, tags }
 */
async function generateArticle(story) {
  const userPrompt = `Here is the raw boxing news story. Write a full SEO article based on it.

SOURCE HEADLINE: ${story.headline}
SOURCE URL: ${story.url}
PUBLISHED: ${story.publishedAt}

RAW ARTICLE TEXT:
${story.fullText}

Remember: output ONLY valid JSON with the fields title, byline, fullText, and tags.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  // Strip any accidental markdown fences
  const clean = raw.replace(/```json|```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${clean.slice(0, 200)}`);
  }

  return parsed;
}

module.exports = { generateArticle };
