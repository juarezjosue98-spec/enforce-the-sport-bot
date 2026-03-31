const {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  HeadingLevel, ExternalHyperlink,
} = require('docx');

/**
 * Parses a paragraph string that may contain <a href="...">text</a> tags
 * and returns an array of docx TextRun / ExternalHyperlink children.
 */
function parseInlineLinks(text) {
  const children = [];
  const linkRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    // Text before the link
    if (match.index > lastIndex) {
      children.push(
        new TextRun({
          text: text.slice(lastIndex, match.index),
          font: 'Georgia',
          size: 24,
          color: '111111',
        })
      );
    }

    // The hyperlink itself
    children.push(
      new ExternalHyperlink({
        link: match[1],
        children: [
          new TextRun({
            text: match[2],
            font: 'Georgia',
            size: 24,
            color: '1155CC',
            underline: {},
          }),
        ],
      })
    );

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last link
  if (lastIndex < text.length) {
    children.push(
      new TextRun({
        text: text.slice(lastIndex),
        font: 'Georgia',
        size: 24,
        color: '111111',
      })
    );
  }

  return children.length > 0
    ? children
    : [new TextRun({ text, font: 'Georgia', size: 24, color: '111111' })];
}

/**
 * Takes a structured article object { title, byline, fullText, tags }
 * and returns a Buffer containing the .docx file.
 * fullText may contain <a href="..."> hyperlink tags.
 */
async function buildDocx(article) {
  const { title, byline, fullText, tags } = article;

  const paragraphs = fullText
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const children = [];

  // --- TITLE ---
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text: title,
          font: 'Georgia',
          size: 48,
          bold: false,
          color: '111111',
        }),
      ],
      spacing: { before: 0, after: 400 },
    })
  );

  // --- BYLINE ---
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `By ${byline}`,
          font: 'Georgia',
          size: 20,
          color: '444444',
        }),
      ],
      spacing: { before: 0, after: 480 },
    })
  );

  // --- BODY PARAGRAPHS (with inline hyperlink support) ---
  for (const para of paragraphs) {
    children.push(
      new Paragraph({
        children: parseInlineLinks(para),
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 280, line: 360 },
      })
    );
  }

  // --- SEO TAGS FOOTER ---
  if (tags) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Tags: ${tags}`,
            font: 'Georgia',
            size: 18,
            color: '888888',
            italics: true,
          }),
        ],
        alignment: AlignmentType.LEFT,
        spacing: { before: 720, after: 0 },
      })
    );
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Georgia', size: 24 } },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          run: { size: 48, bold: false, font: 'Georgia', color: '111111' },
          paragraph: { spacing: { before: 0, after: 360 }, outlineLevel: 0 },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildDocx };
