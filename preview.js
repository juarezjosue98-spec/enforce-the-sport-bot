const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PREVIEW_SYSTEM_PROMPT = `You are an expert boxing writer for EnforceTheSport.
Your job is to write an upcoming fight preview that follows the ETS style guide exactly.
You have access to web search results that will be provided to you — use that data for all stats, records, and recent performances.

ETS FIGHT PREVIEW STYLE GUIDE — follow this structure exactly:

TITLE: Dynamic and game-focused, not clickbait. Reflect the stakes of the fight.

PARAGRAPH 1 — Set the Stage (Context + Stakes):
- Each fighter's record and recent momentum
- Big-picture stakes: title implications, rankings, rivalry history
- The tone of the matchup: heated, high-risk, unpredictable?
- Answer: Why should fans care about this fight?

PARAGRAPH 2 — Fighter A Analysis (Strengths, Weaknesses, Trends):
- Key stats and recent performances
- Offense and defense strengths
- Coaching notes, injuries, or strategy trends
- Keep it factual and balanced — this is not an opinion article

PARAGRAPH 3 — Fighter B Analysis (Strengths, Weaknesses, Trends):
- Same format as Paragraph 2 but for the opponent
- Key stats and recent performances
- Offense and defense strengths
- Coaching notes, injuries, or strategy trends

PARAGRAPH 4 — Key Matchups and X-Factors:
- Player-vs-player battles that will decide the fight
- Style clashes: pressure vs. movement, power vs. speed, reach advantages
- Hidden X-factors: ring rust, southpaw problems, altitude, crowd, late notice
- What each fighter must do to win

PARAGRAPH 5 — Expectations and Prediction:
- What style of fight to expect: war of attrition, technical chess match, early stoppage
- Who has the momentum edge and why
- What fans should watch for
- Optional: a clear prediction on who wins and how

WRITING RULES — non-negotiable:
- NO headers in the article body — pure flowing prose paragraphs only
- NO parentheses anywhere — work all info naturally into sentences
- Always capitalize weight division names: Heavyweight, Super Welterweight, Lightweight, etc.
- Each fighter's full name on first reference, then last name after
- Records written in prose: "Canelo carries a record of 61 wins, two losses, and two draws" — never in parentheses
- Paragraphs must be 4 to 7 sentences — consistent length, clean flow, professional tone
- Use active verbs: surge, pressure, collapse, ignite, dominate, anchor, power
- Balance stats with narrative — stats tell what happened, narrative tells why it matters
- Write like you're speaking to fans who already know the basics
- NEVER overhype without stats to back it up
- NEVER use one-sided analysis — both fighters get fair treatment
- NEVER use outdated numbers — only use stats from the web search results provided
- NEVER use these AI phrases: "delve", "underscore", "it's worth noting", "furthermore", "moreover", "in conclusion", "landscape", "tapestry", "game-changing"
- Use contractions naturally: "he didn't", "that's", "it's", "wasn't"
- Byline is always: Joshua Juarez

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown, no extra text:
{
  "title": "Dynamic fight-focused headline under 70 chars",
  "byline": "Joshua Juarez",
  "fullText": "Five paragraphs of flowing prose separated by double newline (\\n\\n). No headers. No parentheses.",
  "tags": "Comma-separated SEO tags: both fighter names, weight division, promotion, year, preview"
}`;

/**
 * Searches the web for fight info and stats, then generates a preview.
 * fighterA and fighterB are name strings e.g. "Canelo Alvarez", "Jaime Munguia"
 */
async function generatePreview(fighterA, fighterB) {
  // Use web search tool to get current stats and fight details
  const searchPrompt = `Search for the latest information about the upcoming boxing fight between ${fighterA} vs ${fighterB}.
Find:
- Both fighters' current records and recent fight results
- Current rankings and any titles on the line
- Fight date, venue, and weight class
- Recent form, stats, and any notable storylines or injuries
- Historical matchup context if any

Then write a full ETS fight preview article following the style guide.
Output ONLY valid JSON with fields: title, byline, fullText, tags.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2500,
    system: PREVIEW_SYSTEM_PROMPT,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
      },
    ],
    messages: [{ role: 'user', content: searchPrompt }],
  });

  // Extract the final text response — may come after tool use blocks
  const textBlocks = response.content.filter((b) => b.type === 'text');

  // If tool use happened, we need to continue the conversation
  if (response.stop_reason === 'tool_use') {
    // Build full message history including tool results
    const messages = [{ role: 'user', content: searchPrompt }];
    messages.push({ role: 'assistant', content: response.content });

    // Add tool results for each tool use block
    const toolResults = response.content
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({
        type: 'tool_result',
        tool_use_id: b.id,
        content: b.input?.query ? `Search completed for: ${b.input.query}` : 'Search completed',
      }));

    messages.push({ role: 'user', content: toolResults });

    // Get final response with article
    const finalResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      system: PREVIEW_SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages,
    });

    const finalText = finalResponse.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return parseArticleJSON(finalText);
  }

  const raw = textBlocks.map((b) => b.text).join('');
  return parseArticleJSON(raw);
}

function parseArticleJSON(raw) {
  const clean = raw.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    throw new Error(`Preview returned invalid JSON: ${clean.slice(0, 200)}`);
  }
}

module.exports = { generatePreview };
