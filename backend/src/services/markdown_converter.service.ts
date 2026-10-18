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

const normalizeTableCell = (cellText: string): string =>
  cellText.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();

turndown.addRule('tables', {
  filter: ['table'],
  replacement: (_content, node) => {
    const table = node as HTMLTableElement;
    const rows = Array.from(table.querySelectorAll('tr'));

    if (rows.length === 0) {
      return '';
    }

    const headerCells = Array.from(rows[0].querySelectorAll('th, td')).map((cell) =>
      normalizeTableCell(cell.textContent ?? ''),
    );

    const dataRows = rows.slice(headerCells.length > 0 ? 1 : 0);
    const columnCount = Math.max(
      headerCells.length,
      ...dataRows.map((row) => Array.from(row.querySelectorAll('th, td')).length),
    );

    const padCells = (cells: string[]) => {
      const padded = [...cells];
      while (padded.length < columnCount) {
        padded.push('');
      }
      return padded.slice(0, columnCount);
    };

    const lines: string[] = [];

    if (headerCells.length > 0) {
      lines.push(`| ${padCells(headerCells).join(' | ')} |`);
      lines.push(`| ${padCells(Array.from({ length: columnCount }, () => '---')).join(' | ')} |`);
    }

    dataRows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll('th, td')).map((cell) =>
        normalizeTableCell(cell.textContent ?? ''),
      );

      if (cells.some((cell) => cell.length > 0)) {
        lines.push(`| ${padCells(cells).join(' | ')} |`);
      }
    });

    return lines.length === 0 ? '' : `\n\n${lines.join('\n')}\n\n`;
  },
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

  document
    .querySelectorAll(
      'script, style, nav, header, footer, aside, noscript',
    )
    .forEach((element) => element.remove());

  // Convert prose inside <pre> to a paragraph.
  document.querySelectorAll('pre:not(:has(code))').forEach((pre) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = pre.textContent?.trim() ?? '';
    pre.replaceWith(paragraph);
  });

  const article = new Readability(document).parse();
  const title = article?.title?.trim() || fallbackTitle.trim();
  const html = article?.content || document.body.innerHTML;

  dom.window.close();

  const markdown = turndown.turndown(html).trim();

  if (!markdown) {
    throw new Error('Article content is empty after Markdown conversion');
  }

  return {
    title,
    markdown,
  };
}


