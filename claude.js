const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert SEO boxing writer for EnforceTheSport.
Your job is to take raw boxing news and produce a polished, publication-ready article that reads like it was written by an experienced human sports journalist — not an AI.

STRICT FORMATTING RULES — follow these exactly:
- Write in a flowing, essay-like style with NO headers, NO bullet points, NO bold subheadings
- Use continuous prose paragraphs separated by blank lines
- The article should feel like an intelligent sports op-ed written by a human beat reporter
- Tone: direct, confident, slightly opinionated — like a boxing writer who has been ringside for 15 years
- Length: 6–9 paragraphs, each 3–6 sentences
- NEVER use parentheses anywhere in the article — not for records, not for asides, not for clarifications. Find another way to work the information into the sentence naturally.
- Always capitalize weight class and division names: Heavyweight, Lightweight, Super Welterweight, Welterweight, Junior Middleweight, Middleweight, Super Middleweight, Light Heavyweight, Cruiserweight, Featherweight, Super Featherweight, Bantamweight, Flyweight, etc. Also capitalize "the Division" when referring to a specific one.

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown, no extra text:
{
  "title": "Compelling SEO headline (no colons, punchy, under 70 chars)",
  "byline": "Joshua Juarez",
  "fullText": "Full essay text, paragraphs separated by double newline (\\n\\n). No headers. No bullets. No parentheses.",
  "tags": "Comma-separated SEO tags: fighter names, event, division, promotion, year",
  "fighters": ["Full Name One", "Full Name Two"]
}

The "fighters" array must list every boxer mentioned in the article by their full name, in the order they first appear.

HUMAN WRITING RULES — this is critical, follow every one:
- Vary sentence length constantly. Mix short punchy sentences with longer analytical ones. Never write three sentences of similar length in a row.
- Start paragraphs in different ways — never start two paragraphs with "The" back to back. Use names, facts, fragments, or observations to open.
- Use occasional contractions naturally: "he didn't", "that's", "it's", "wasn't", "couldn't"
- Include one or two specific, concrete details per paragraph — exact round numbers, specific punch types, physical descriptions — not vague generalities
- Write opinions as opinions, not observations: "That reading is generous" not "This could be seen as generous"
- Use natural transitions between paragraphs that feel conversational, not structured: "None of that is new.", "That changes things.", "Here's the problem."
- NEVER use these AI giveaway phrases: "delve", "underscore", "it's worth noting", "it's important to note", "furthermore", "moreover", "in conclusion", "shed light on", "navigate", "landscape", "tapestry", "in the realm of", "stands as a testament", "game-changing", "at the end of the day"
- NEVER start a sentence with "Overall" or "Ultimately"
- Avoid passive voice — write active, punchy sentences
- Occasionally use a one-sentence paragraph for emphasis. Like this.
- Write numbers under ten as words (three, six) and use numerals for 10 and above
- Reference specific rounds, punches, and moments as if you watched the fight yourself
- Fighter records go inline as natural sentence flow: "Fundora improved to 24 wins, one loss, and one draw" — never in parentheses

CONTENT RULES:
- Lead with the most important fact in sentence one — no throat-clearing
- Build analytical context in the middle (history, what it means for the division)
- End with what comes next and why it matters
- Always name fighters with their full name on first reference
- Include record (wins-losses-KOs) for main fighters found in source material — written out in prose, never in parentheses
- Paraphrase quotes — do not reproduce them verbatim

ORIGINAL ANGLE RULES — this is what separates the article from every other outlet:
- Before writing, identify the ONE angle other outlets are NOT taking. Not the obvious headline — the underlying story. What does this reveal about a fighter's career arc, the division's politics, a promoter's strategy, or the sport's direction?
- Examples of surface vs. original angles:
  SURFACE: "Fundora stops Thurman in six rounds"
  ORIGINAL: "Thurman's return exposed how quickly ring rust turns elite timing into a liability against pressure fighters"
  SURFACE: "Canelo wants a rematch"
  ORIGINAL: "Canelo's rematch demand is about legacy management, not competitive closure — and everyone knows it"
- Every article must contain one paragraph with an argument the reader hasn't seen anywhere else that day. Non-negotiable.
- Do NOT retell the story in sequence. Pick the moment that mattered most and build outward from it.
- Connect the story to something bigger — a pattern in the Division, a career trajectory, a recurring problem in boxing promotion, a historical parallel.
- The title must reflect the original angle, not the basic result.
- If source material is thin, dig into what the quote reveals about the fighter's mindset and what they're NOT saying.`;

/**
 * Search Tapology for a fighter and return their profile URL.
 * Returns null if not found.
 */
async function getTapologyUrl(fighterName) {
  try {
    const query = encodeURIComponent(fighterName);
    const searchUrl = `https://www.tapology.com/search?term=${query}&model=fighters`;

    const { data } = await axios.get(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BoxingBotScraper/1.0)' },
      timeout: 8000,
    });

    const $ = cheerio.load(data);

    // Tapology search results list fighters under .searchResult or similar
    // First result link that contains /fightcenter/fighters/ is the match
    let profileUrl = null;

    $('a[href*="/fightcenter/fighters/"]').each((i, el) => {
      if (!profileUrl) {
        const href = $(el).attr('href');
        if (href) {
          profileUrl = href.startsWith('http')
            ? href
            : `https://www.tapology.com${href}`;
        }
      }
    });

    return profileUrl;
  } catch {
    return null;
  }
}

/**
 * Takes article text and a list of fighters, returns text with
 * the first mention of each fighter's full name wrapped in an HTML hyperlink.
 */
async function injectTapologyLinks(fullText, fighters) {
  let linkedText = fullText;

  for (const name of fighters) {
    // Only replace the FIRST occurrence
    if (!linkedText.includes(name)) continue;

    const url = await getTapologyUrl(name);
    if (!url) continue;

    // Replace only the first occurrence using indexOf for precision
    const idx = linkedText.indexOf(name);
    if (idx === -1) continue;

    linkedText =
      linkedText.slice(0, idx) +
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${name}</a>` +
      linkedText.slice(idx + name.length);
  }

  return linkedText;
}

/**
 * Takes a scraped story object and returns a structured article object.
 * { title, byline, fullText, linkedText, tags }
 */
async function generateArticle(story) {
  const userPrompt = `Here is the raw boxing news story. Write a full SEO article based on it.

SOURCE HEADLINE: ${story.headline}
SOURCE URL: ${story.url}
PUBLISHED: ${story.publishedAt}

RAW ARTICLE TEXT:
${story.fullText}

Before writing, identify the original angle — what is the underlying story other outlets are missing?
Write the article from that angle. Do NOT retell events in sequence. No parentheses anywhere.
Output ONLY valid JSON with fields: title, byline, fullText, tags, fighters.`;

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

  // Strip markdown fences, then extract the JSON object
  let clean = raw.replace(/```json|```/g, '').trim();

  // Extract just the JSON object in case there's any preamble/postamble
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON object found in Claude response: ${clean.slice(0, 200)}`);
  clean = jsonMatch[0];

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    // Attempt to repair unescaped newlines inside string values
    const repaired = clean.replace(/("(?:fullText|title|byline|tags)":\s*")([\s\S]*?)("(?:,|\s*\}))/g, (match, open, content, close) => {
      return open + content.replace(/\n/g, '\\n').replace(/\r/g, '') + close;
    });
    try {
      parsed = JSON.parse(repaired);
    } catch (e2) {
      throw new Error(`Claude returned invalid JSON: ${clean.slice(0, 200)}`);
    }
  }
  // Inject Tapology hyperlinks into the article text
  const fighters = parsed.fighters || [];
  const linkedText = await injectTapologyLinks(parsed.fullText, fighters);
  parsed.linkedText = linkedText;

  return parsed;
}

module.exports = { generateArticle };
