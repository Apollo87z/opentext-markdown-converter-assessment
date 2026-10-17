import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

export function conversionEngine(html: string, articleTitle: string) {
  const data = cheerio.load(html);
  data('script, style, nav, footer, header, aside, noscript').remove();

  const markdown = turndown.turndown(data.html() ? data('body').html() ?? html : html).trim();

  if (!markdown) {
    throw new Error('Article content is empty after Markdown conversion');
  }

  return {
    title: articleTitle.trim(),
    markdown,
  };
}