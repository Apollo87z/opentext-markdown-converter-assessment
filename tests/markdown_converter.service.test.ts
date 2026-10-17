import assert from 'node:assert/strict';
import test from 'node:test';

import { conversionEngine } from '../src/services/markdown_converter.service';

test('conversionEngine converts HTML content into markdown and trims the title', () => {
  const result = conversionEngine(
    '<h1>  Example Title  </h1><nav>Menu</nav><p>Hello <strong>world</strong>!</p>',
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
    'Visible page',
  );

  assert.equal(result.title, 'Visible page');
  assert.match(result.markdown, /Visible content/i);
  assert.doesNotMatch(result.markdown, /Header|Footer/i);
});

test('conversionEngine throws an error when the converted markdown is empty', () => {
  assert.throws(
    () => conversionEngine('<script>alert("x")</script><style>body{color:red}</style>', 'Title'),
    /Article content is empty after Markdown conversion/,
  );
});
