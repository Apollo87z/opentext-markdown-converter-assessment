import assert from 'node:assert/strict';
import test from 'node:test';

import { conversionEngine } from '../src/services/markdown_converter.service';

const sourceUrl = 'https://my.opentext.com/support/article/1986936';

test('conversionEngine converts HTML content into markdown and trims the title', () => {
  const result = conversionEngine(
    '<h1>  Example Title  </h1><nav>Menu</nav><p>Hello <strong>world</strong>!</p>',
    sourceUrl,
    '  Example Title  ',
  );

  assert.equal(result.title, 'Example Title');
  assert.match(result.markdown, /Hello/i);
  assert.match(result.markdown, /\*\*world\*\*/i);
  assert.doesNotMatch(result.markdown, /<[^>]+>/);
});

test('conversionEngine strips non-content DOM elements before conversion', () => {
  const result = conversionEngine(
    '<header>Header</header><main><p>Visible content</p></main><footer>Footer</footer>',
    sourceUrl,
    'Visible page',
  );

  assert.equal(result.title, 'Visible page');
  assert.match(result.markdown, /Visible content/i);
  assert.doesNotMatch(result.markdown, /Header|Footer/i);
});

test('conversionEngine preserves HTML table structure as Markdown tables', () => {
  const result = conversionEngine(
    '<table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>Alice</td><td>42</td></tr><tr><td>Bob</td><td>24</td></tr></tbody></table>',
    sourceUrl,
    'Table Example',
  );

  assert.match(result.markdown, /^\| Name \| Value \|/m);
  assert.match(result.markdown, /^\| --- \| --- \|/m);
  assert.match(result.markdown, /\| Alice \| 42 \|/m);
  assert.match(result.markdown, /\| Bob \| 24 \|/m);
  assert.doesNotMatch(result.markdown, /Name\s*Value\s*Alice\s*42/m);
});

test('conversionEngine throws an error when the converted markdown is empty', () => {
  assert.throws(
    () =>
      conversionEngine(
        '<script>alert("x")</script><style>body{color:red}</style>',
        sourceUrl,
        'Title',
      ),
    /Article content is empty after Markdown conversion/,
  );
});