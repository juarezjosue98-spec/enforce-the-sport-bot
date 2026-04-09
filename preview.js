const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PREVIEW_SYSTEM_PROMPT = `You are an expert boxing writer for EnforceTheSport.
You will be given web search results about an upcoming fight. Use that data to write a fight preview.

ETS FIGHT PREVIEW STRUCTURE — five prose paragraphs, no headers:

Paragraph 1 — Set the Stage: Each fighter's record and recent momentum, title implications, rankings, rivalry history, why fans should care.

Paragraph 2 — Fighter A Analysis: Key stats, recent performances, offense and defense strengths, coaching notes, injuries or strategy trends. Factual and balanced.

Paragraph 3 — Fighter B Analysis: Same format as Paragraph 2 for the opponent.

Paragraph 4 — Key Matchups and X-Factors: Style clashes, player-vs-player battles, hidden X-factors like ring rust, southpaw problems, reach, crowd, what each fighter must do to win.

Paragraph 5 — Prediction: Style of fight expected, who has the momentum edge, what fans should watch for, optional score or method prediction.

WRITING RULES:
- NO headers anywhere in the article body
- NO parentheses anywhere — work all info naturally into sentences
- Capitalize all weight division names: Heavyweight, Super Welterweight, Lightweight, etc.
- Full name on first reference, last name after
- Records in prose: "Fury holds a record of 34 wins and one draw" — never in parentheses
- Paragraphs 4 to 7 sentences each
- Active verbs: surge, pressure, collapse, ignite, dominate, anchor, power
- Contractions: "he didn't", "that's", "it's", "wasn't"
- NEVER use: "delve", "underscore", "it's worth noting", "furthermore", "moreover", "in conclusion", "landscape", "tapestry"
- Byline is always: Joshua Juarez

CRITICAL OUTPUT RULE:
You MUST respond with ONLY a raw JSON object. No introduction. No explanation. No markdown. No code fences.
Start your response with { and end with }. Nothing before the opening brace. Nothing after the closing brace.

The JSON must have exactly these fields:
{
  "title": "headline here",
  "byline": "Joshua Juarez",
  "fullText": "five paragraphs separated by \\n\\n",
  "tags": "comma separated tags"
}`;

async function generatePreview(fighterA, fighterB) {
  // Step 1: Search for fight info
  const searchQuery = `${fighterA} vs ${fighterB} boxing fight 2025 2026 stats record preview`;

  const searchResponse = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{
      role: 'user',
      content: `Search for current information about the boxing fight: ${fighterA} vs ${fighterB}. Find both fighters records, recent fights, stats, fight date and venue if announced, weight class, and any title implications. Search thoroughly.`
    }],
  });

  // Collect all search result text
  let searchData = '';
  for (const block of searchResponse.content) {
    if (block.type === 'tool_result' || block.type === 'text') {
      searchData += block.text || '';
    }
    if (block.type === 'tool_use') {
      searchData += `[Searched: ${block.input?.query || ''}] `;
    }
  }

  // Also grab any text summaries Claude produced during search
  const searchTextBlocks = searchResponse.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  searchData += '\n' + searchTextBlocks;

  // Step 2: Now write the article with all that context
  const writeResponse = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2500,
    system: PREVIEW_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Here is the research data for the fight between ${fighterA} and ${fighterB}:\n\n${searchData}\n\nNow write the ETS fight preview. Remember: respond with ONLY the raw JSON object. Start immediately with { and end with }. No text before or after.`
      }
    ],
  });

  const raw = writeResponse.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  return parseArticleJSON(raw, fighterA, fighterB);
}

function parseArticleJSON(raw, fighterA, fighterB) {
  // Try to extract JSON even if there's text around it
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not find JSON in response. Raw: ${raw.slice(0, 300)}`);
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    // Try cleaning common issues
    const cleaned = jsonMatch[0]
      .replace(/[\x00-\x1F\x7F]/g, ' ') // remove control chars
      .replace(/,\s*}/g, '}')            // trailing commas
      .replace(/,\s*]/g, ']');

    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      throw new Error(`Invalid JSON even after cleaning: ${cleaned.slice(0, 300)}`);
    }
  }
}

module.exports = { generatePreview };
