import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';

import router from '../src/routes/converter_routes';
import { errorHandler, notFoundHandler } from '../src/middleware/errorHandler';

const articleUrl = 'https://my.opentext.com/support/article/1986936';
const apiUrl = 'https://my.opentext.com/api/web/support/article/1986936';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const buildApp = () => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

const withMockedFetch = async (
  mock: typeof fetch,
  run: () => Promise<void>,
) => {
  const originalFetch = global.fetch;
  global.fetch = mock;

  try {
    await run();
  } finally {
    global.fetch = originalFetch;
  }
};

const successResponse = (
  overrides: Record<string, unknown> = {},
): Response =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      response: {
        Content: '<h1>Sample article</h1><p>Hello <strong>world</strong>!</p>',
        Title: 'Sample article',
        ...overrides,
      },
    }),
  }) as Response;

const payloadFetch = (payload: unknown) =>
  (async () => ({ ok: true, json: async () => payload }) as Response) as typeof fetch;

const getArticleWith = async (
  overrides: Record<string, unknown> = {},
  accept = 'application/json',
) => {
  let res: any;

  await withMockedFetch(
    (async () => successResponse(overrides)) as typeof fetch,
    async () => {
      res = await request(buildApp())
        .get('/articles')
        .query({ url: articleUrl })
        .set('Accept', accept);
    },
  );

  return res;
};

const getExpectingNoFetch = async (
  url?: unknown,
  duplicate = false,
) => {
  let fetchCalls = 0;
  let res: any;

  await withMockedFetch(
    (async () => {
      fetchCalls += 1;
      return successResponse();
    }) as typeof fetch,
    async () => {
      let req = request(buildApp()).get('/articles');

      if (duplicate && typeof url === 'string') {
        req = req.query({ url: [url, url] });
      } else if (url !== undefined) {
        req = req.query({ url });
      }

      res = await req;
    },
  );

  return { res, fetchCalls };
};

/* -------------------------------------------------------------------------- */
/* 1. Input validation (400)                                                   */
/* -------------------------------------------------------------------------- */

test('GET /articles returns 400 when url is missing', async () => {
  const { res, fetchCalls } = await getExpectingNoFetch();

  assert.equal(res.status, 400);
  assert.equal(res.body.status, 'error');
  assert.equal(res.body.error, 'Validation failed');
  assert.equal(res.body.message, 'Please provide a valid article URL.');
  assert.equal(fetchCalls, 0);
});

test('GET /articles returns 400 when url is not a string or is blank', async () => {
  for (const url of [123, '', '   ']) {
    const { res, fetchCalls } = await getExpectingNoFetch(url);

    assert.equal(res.status, 400, String(url));
    assert.equal(res.body.status, 'error', String(url));
    assert.equal(fetchCalls, 0, String(url));
  }
});

test('GET /articles returns 400 for invalid or blocked article URLs', async () => {
  const invalidUrls = [
    'not-a-url',
    'https://my.opentext.com/support/article/abc',
    'https://my.opentext.com/support/article/123/foo',
    'https://ex.com/support/article/1986936',
    'https://my.opentext.com.evil.com/support/article/1986936',
    'http://my.opentext.com/support/article/1986936',
    'https://my.opentext.com/support/article',
  ];

  for (const url of invalidUrls) {
    const { res, fetchCalls } = await getExpectingNoFetch(url);

    assert.equal(res.status, 400, url);
    assert.equal(res.body.status, 'error', url);
    assert.equal(fetchCalls, 0, url);
  }
});

test('GET /articles returns 400 when url exceeds 2048 characters', async () => {
  const longUrl = `https://my.opentext.com/support/article/${'9'.repeat(2100)}`;
  const { res, fetchCalls } = await getExpectingNoFetch(longUrl);

  assert.equal(res.status, 400);
  assert.equal(res.body.message, 'Please provide a valid article URL.');
  assert.equal(fetchCalls, 0);
});

test('GET /articles returns 400 when url is supplied twice', async () => {
  const { res, fetchCalls } = await getExpectingNoFetch(articleUrl, true);

  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Validation failed');
  assert.equal(fetchCalls, 0);
});

test('valid article URLs with trailing slash, query string, or hash are accepted', async () => {
  const validUrls = [
    'https://my.opentext.com/support/article/1986936/',
    'https://my.opentext.com/support/article/1986936?x=1',
    'https://my.opentext.com/support/article/1986936#section',
  ];

  for (const url of validUrls) {
    await withMockedFetch(
      (async () => successResponse()) as typeof fetch,
      async () => {
        const response = await request(buildApp())
          .get('/articles')
          .query({ url });

        assert.equal(response.status, 200, url);
      },
    );
  }
});

/* -------------------------------------------------------------------------- */
/* 2. Upstream failures (502)                                                  */
/* -------------------------------------------------------------------------- */

test('fetch uses the correct API URL and a timeout signal', async () => {
  let seenUrl: string | undefined;
  let seenSignal: AbortSignal | undefined;

  await withMockedFetch(
    (async (url: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(url);
      seenSignal = init?.signal as AbortSignal | undefined;
      return successResponse();
    }) as typeof fetch,
    async () => {
      const response = await request(buildApp())
        .get('/articles')
        .query({ url: articleUrl });

      assert.equal(response.status, 200);
      assert.equal(seenUrl, apiUrl);
      assert.ok(seenSignal instanceof AbortSignal);
    },
  );
});

test('GET /articles returns 502 when upstream responds with a non-OK status', async () => {
  await withMockedFetch(
    (async () => ({ ok: false, status: 500 }) as Response) as typeof fetch,
    async () => {
      const response = await request(buildApp())
        .get('/articles')
        .query({ url: articleUrl });

      assert.equal(response.status, 502);
      assert.equal(response.body.error, 'Bad gateway');
      assert.equal(response.body.message, 'Failed to load article.');
    },
  );
});

test('GET /articles returns 502 when fetch throws', async () => {
  await withMockedFetch(
    (async () => {
      throw new Error('network timeout');
    }) as typeof fetch,
    async () => {
      const response = await request(buildApp())
        .get('/articles')
        .query({ url: articleUrl });

      assert.equal(response.status, 502);
      assert.equal(response.body.message, 'Failed to load article.');
    },
  );
});

test('GET /articles returns 502 when response.json() throws', async () => {
  await withMockedFetch(
    (async () =>
      ({
        ok: true,
        json: async () => {
          throw new Error('bad json');
        },
      }) as unknown as Response) as typeof fetch,
    async () => {
      const response = await request(buildApp())
        .get('/articles')
        .query({ url: articleUrl });

      assert.equal(response.status, 502);
      assert.equal(response.body.message, 'Failed to load article.');
    },
  );
});

test('GET /articles returns 502 when the article payload is invalid', async () => {
  const invalidPayloads: Array<[string, unknown]> = [
    ['no response key', {}],
    ['empty response object', { response: {} }],
    ['Content missing', { response: { Title: 'Example title' } }],
    ['Content empty', { response: { Content: '' } }],
    ['Content not a string', { response: { Content: 123 } }],
  ];

  for (const [name, payload] of invalidPayloads) {
    await withMockedFetch(payloadFetch(payload), async () => {
      const response = await request(buildApp())
        .get('/articles')
        .query({ url: articleUrl });

      assert.equal(response.status, 502, name);
      assert.equal(response.body.error, 'Bad gateway', name);
      assert.equal(response.body.message, 'Invalid article response.', name);
    });
  }
});

test('Content of exactly 2,000,000 characters is accepted', async () => {
  const response = await getArticleWith({ Content: 'A'.repeat(2_000_000) });

  assert.equal(response.status, 200);
});

test('Content over 2,000,000 characters returns 502', async () => {
  const response = await getArticleWith({
    Content: 'A'.repeat(2_000_001),
  });

  assert.equal(response.status, 502);
  assert.equal(response.body.message, 'Invalid article response.');
});

/* -------------------------------------------------------------------------- */
/* 3. Request-level errors                                                     */
/* -------------------------------------------------------------------------- */

test('GET /missing-route returns 404', async () => {
  const response = await request(buildApp()).get('/missing-route');

  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'Route not found');
});

test('unexpected errors return generic 500 without leaking details', async () => {
  const app = express();

  app.use(express.json());
  app.get('/_boom', () => {
    throw new Error('top-secret-stack-trace');
  });
  app.use(errorHandler);

  const response = await request(app).get('/_boom');

  assert.equal(response.status, 500);
  assert.equal(response.body.error, 'Internal server error');
  assert.equal(
    response.body.message,
    'Something went wrong. Please try again later.',
  );
  assert.equal(response.text.includes('top-secret-stack-trace'), false);
});

/* -------------------------------------------------------------------------- */
/* 4. Successful responses and content negotiation                             */
/* -------------------------------------------------------------------------- */

test('GET /articles with Accept: application/json returns article metadata', async () => {
  const response = await getArticleWith({
    Id: '1986936',
    ArticleType: 'Article',
    Views: 42,
  });

  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /application\/json/);
  assert.equal(response.body.status, 'success');
  assert.equal(response.body.sourceUrl, articleUrl);
  assert.equal(response.body.contentType, 'text/markdown');
  assert.equal(response.body.article.id, '1986936');
  assert.match(response.body.markdown, /^---/);
  assert.match(response.body.markdown, /Sample article/i);
});

test('GET /articles without Accept returns Markdown', async () => {
  await withMockedFetch(
    (async () => successResponse()) as typeof fetch,
    async () => {
      const response = await request(buildApp())
        .get('/articles')
        .query({ url: articleUrl });

      assert.equal(response.status, 200);
      assert.match(response.headers['content-type'], /text\/markdown/);
      assert.match(response.text, /^---\nstatus: success/);
      assert.match(response.text, /\*\*world\*\*/);
    },
  );
});

test('GET /articles returns Markdown for Accept: */* and text/markdown', async () => {
  for (const accept of ['*/*', 'text/markdown']) {
    const response = await getArticleWith({}, accept);

    assert.equal(response.status, 200, accept);
    assert.match(response.headers['content-type'], /text\/markdown/, accept);
    assert.match(response.text, /^---/, accept);
  }
});

test('GET /articles returns 406 for unsupported Accept types', async () => {
  const response = await getArticleWith({}, 'text/html');

  assert.equal(response.status, 406);
  assert.equal(response.body.error, 'Not acceptable');
});

test('GET /articles sets Vary: Accept', async () => {
  const response = await getArticleWith();

  assert.equal(response.status, 200);
  assert.match(response.headers.vary, /Accept/i);
});

test('GET /articles returns Markdown and the s-maxage cache header', async () => {
  await withMockedFetch(
    (async () => successResponse()) as typeof fetch,
    async () => {
      const response = await request(buildApp())
        .get('/articles')
        .query({ url: articleUrl })
        .set('Accept', 'text/markdown');

      assert.equal(response.status, 200);
      assert.match(response.headers['cache-control'], /s-maxage=31536000/);
      assert.match(response.text, /^---/);
      assert.match(response.text, /Hello/);
    },
  );
});

test('title falls back to Article <id> when Title is missing', async () => {
  const response = await getArticleWith({
    Title: '',
    Id: '1986936',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.article.title, 'Article 1986936');
});

test('products and versions appear in article metadata and front matter', async () => {
  const response = await getArticleWith({
    Id: '1986936',
    Title: 'Product article',
    Products: [
      {
        Id: 'prod-1',
        DisplayLabel: 'Product One',
        versions: [{ version: '1.0' }, { version: '2.0' }],
      },
      {
        Id: 'prod-2',
        DisplayLabel: 'Product Two',
        versions: [{ version: '3.0' }],
      },
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.article.products.length, 2);
  assert.deepEqual(response.body.article.products[0].versions, ['1.0', '2.0']);
  assert.deepEqual(response.body.article.products[1].versions, ['3.0']);
  assert.match(response.body.markdown, /products:/);
  assert.match(response.body.markdown, /Product One/);
  assert.match(response.body.markdown, /"1\.0"/);
});

test('createdAt and updatedAt are ISO strings or null', async () => {
  const withDates = await getArticleWith({
    CreatedTime: 1750797136000,
    LastContentUpdateTime: 1791332026282,
  });

  assert.equal(
    withDates.body.article.createdAt,
    new Date(1750797136000).toISOString(),
  );
  assert.equal(
    withDates.body.article.updatedAt,
    new Date(1791332026282).toISOString(),
  );

  const withoutDates = await getArticleWith();

  assert.equal(withoutDates.body.article.createdAt, null);
  assert.equal(withoutDates.body.article.updatedAt, null);
});

/* -------------------------------------------------------------------------- */
/* 5. Attachments                                                              */
/* -------------------------------------------------------------------------- */

const attachment = (overrides: Record<string, unknown>) => ({
  id: '1',
  name: 'file.pdf',
  contentType: 'application/pdf',
  size: 2048,
  isExternalAttachment: false,
  ...overrides,
});

test('attachments: relative URL resolves to the OpenText origin', async () => {
  const response = await getArticleWith({
    Attachments: [attachment({ url: '/files/a.pdf' })],
  });

  assert.equal(response.status, 200);
  assert.equal(
    response.body.article.attachments[0].url,
    'https://my.opentext.com/files/a.pdf',
  );
});

test('attachments: same-origin absolute URL is kept', async () => {
  const response = await getArticleWith({
    Attachments: [
      attachment({
        url: 'https://my.opentext.com/files/same.pdf',
      }),
    ],
  });

  assert.equal(
    response.body.article.attachments[0].url,
    'https://my.opentext.com/files/same.pdf',
  );
});

test('attachments: foreign-origin URL becomes null and is not in Markdown', async () => {
  const response = await getArticleWith({
    Attachments: [
      attachment({
        name: 'foreign.pdf',
        url: 'https://evil.com/f.pdf',
      }),
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.article.attachments[0].url, null);
  assert.doesNotMatch(response.body.markdown, /evil\.com/);
  assert.match(response.body.markdown, /foreign\.pdf/);
});

test('attachments: foreign-origin fileUrl becomes null', async () => {
  const response = await getArticleWith({
    Attachments: [
      attachment({
        name: 'ext.pdf',
        fileUrl: 'https://evil.com/f.pdf',
        isExternalAttachment: true,
      }),
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.article.attachments[0].url, null);
  assert.doesNotMatch(response.body.markdown, /evil\.com/);
});

test('attachments: malformed URL does not crash the request', async () => {
  const response = await getArticleWith({
    Attachments: [
      attachment({
        name: 'bad.pdf',
        url: 'http://[bad',
      }),
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.article.attachments[0].url, null);
  assert.match(response.body.markdown, /bad\.pdf/);
});

test('attachments: brackets in the name are escaped in the Markdown link', async () => {
  const response = await getArticleWith({
    Attachments: [
      attachment({
        name: 'a[1].pdf',
        url: '/files/a.pdf',
      }),
    ],
  });

  assert.match(response.body.markdown, /\[a\\\[1\\\]\.pdf\]\(</);
});

test('attachments: size is rendered in KB in the Markdown link', async () => {
  const response = await getArticleWith({
    Attachments: [
      attachment({
        url: '/files/a.pdf',
        size: 2048,
      }),
    ],
  });

  assert.match(response.body.markdown, /\(2\.0 KB\)/);
});

test('attachments section appears only when attachments exist', async () => {
  const withAttachments = await getArticleWith({
    Attachments: [attachment({ url: '/files/a.pdf' })],
  });

  assert.match(withAttachments.body.markdown, /## Attachments/);

  const withoutAttachments = await getArticleWith({ Attachments: [] });

  assert.doesNotMatch(withoutAttachments.body.markdown, /## Attachments/);

  const notAnArray = await getArticleWith({ Attachments: 'nope' });

  assert.equal(notAnArray.status, 200);
  assert.doesNotMatch(notAnArray.body.markdown, /## Attachments/);
});

/* -------------------------------------------------------------------------- */
/* 6. Live smoke test (real OpenText API). Run with: LIVE=1 npm test           */
/* -------------------------------------------------------------------------- */

test(
  'live: real article 1986936 returns JSON with converted Markdown',
  { skip: !process.env.LIVE, timeout: 20000 },
  async () => {
    const response = await request(buildApp())
      .get('/articles')
      .query({ url: articleUrl })
      .set('Accept', 'application/json');

    assert.equal(response.status, 200);
    assert.equal(response.body.article.id, '1986936');
    assert.match(response.body.markdown, /^---\nstatus: success/);
  },
);
