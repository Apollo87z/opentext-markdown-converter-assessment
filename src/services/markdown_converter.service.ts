import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

export interface ConversionResult {
  title: string;
  markdown: string;
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

turndown.addRule('codeBlocks', {
  filter: (node) =>
    node.nodeName === 'PRE' && Boolean(node.querySelector('code')),
  replacement: (_content, node) => {
    const code = (node as HTMLElement).querySelector('code');
    if (!code) return '';

    return `\n\n\`\`\`\n${code.textContent?.replace(/\n+$/, '') ?? ''}\n\`\`\`\n\n`;
  },
});

export function conversionEngine(
  input: string,
  sourceUrl: string,
  fallbackTitle = 'Converted Article',
): ConversionResult {
  if (!input.trim()) {
    throw new Error('Article content is empty.');
  }

  const dom = new JSDOM(input, { url: sourceUrl });
  const document = dom.window.document;

  document.querySelectorAll('pre:not(:has(code))').forEach((pre) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = pre.textContent?.trim() ?? '';
    pre.replaceWith(paragraph);
  });

  const article = new Readability(document).parse();
  const title = article?.title?.trim() || fallbackTitle;
  const html = article?.content || document.body.innerHTML;

  dom.window.close();

  return {
    title,
    markdown: turndown.turndown(html).trim(),
  };
}

