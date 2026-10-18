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

// Mocked upstream that returns a given payload as the JSON body.
const payloadFetch = (payload: unknown) =>
  (async () => ({ ok: true, json: async () => payload }) as Response) as typeof fetch;

// POST /convert with a mocked upstream article. Returns the supertest response.
const convertWith = async (
  overrides: Record<string, unknown> = {},
  accept = 'application/json',
) => {
  let res: any;

  await withMockedFetch(
    (async () => successResponse(overrides)) as typeof fetch,
    async () => {
      res = await request(buildApp())
        .post('/convert')
        .set('Accept', accept)
        .send({ url: articleUrl });
    },
  );

  return res;
};

// POST /convert with a body that must be rejected. Also counts fetch calls.
const postExpectingNoFetch = async (body: unknown) => {
  let fetchCalls = 0;
  let res: any;

  await withMockedFetch(
    (async () => {
      fetchCalls += 1;
      return successResponse();
    }) as typeof fetch,
    async () => {
      res = await request(buildApp()).post('/convert').send(body as object);
    },
  );

  return { res, fetchCalls };
};

/* -------------------------------------------------------------------------- */
/* 1. Input validation (400). fetch must never be called.                      */
/* -------------------------------------------------------------------------- */

test('POST /convert returns 400 when url is missing', async () => {
  const { res, fetchCalls } = await postExpectingNoFetch({});

  assert.equal(res.status, 400);
  assert.equal(res.body.status, 'error');
  assert.equal(res.body.error, 'Validation failed');
  assert.equal(res.body.message, 'Please provide a valid article URL.');
  assert.equal(fetchCalls, 0);
});

test('POST /convert returns 400 when url is not a string or is blank', async () => {
  const invalidBodies = [{ url: 123 }, { url: '' }, { url: '   ' }];

  for (const body of invalidBodies) {
    const { res, fetchCalls } = await postExpectingNoFetch(body);

    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.status, 'error', JSON.stringify(body));
    assert.equal(fetchCalls, 0, JSON.stringify(body));
  }
});

test('POST /convert returns 400 for invalid or blocked article URLs', async () => {
  const invalidUrls = [
    'not-a-url',
    'https://my.opentext.com/support/article/abc',
    'https://my.opentext.com/support/article/123/foo',
    'https://ex.com/support/article/1986936',
    'https://my.opentext.com.evil.com/support/article/1986936',
    'http://my.opentext.com/support/article/1986936',
    'https://my.opentext.com/support/article',
  ];

  for (const value of invalidUrls) {
    const { res, fetchCalls } = await postExpectingNoFetch({ url: value });

    assert.equal(res.status, 400, value);
    assert.equal(res.body.status, 'error', value);
    assert.equal(fetchCalls, 0, value);
  }
});

test('POST /convert returns 400 when url exceeds 2048 chars', async () => {
  const longUrl = `https://my.opentext.com/support/article/${'9'.repeat(2100)}`;
  const { res, fetchCalls } = await postExpectingNoFetch({ url: longUrl });

  assert.equal(res.status, 400);
  assert.equal(res.body.message, 'Please provide a valid article URL.');
  assert.equal(fetchCalls, 0);
});

test('GET /articles returns 400 and does not call fetch when url is missing', async () => {
  let fetchCalled = false;

  await withMockedFetch(
    (async () => {
      fetchCalled = true;
      return successResponse();
    }) as typeof fetch,
    async () => {
      const response = await request(buildApp()).get('/articles');

      assert.equal(response.status, 400);
      assert.equal(response.body.error, 'Validation failed');
      assert.equal(fetchCalled, false);
    },
  );
});

test('GET /articles returns 400 when url is supplied twice (array)', async () => {
  const response = await request(buildApp())
    .get('/articles')
    .query({ url: [articleUrl, articleUrl] });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'Validation failed');
});

test('valid article URLs with trailing slash, query string, or hash are accepted', async () => {
  const validUrls = [
    'https://my.opentext.com/support/article/1986936/',
    'https://my.opentext.com/support/article/1986936?x=1',
    'https://my.opentext.com/support/article/1986936#section',
  ];

  for (const value of validUrls) {
    await withMockedFetch(
      (async () => successResponse()) as typeof fetch,
      async () => {
        const response = await request(buildApp())
          .post('/convert')
          .send({ url: value });

        assert.equal(response.status, 200, value);
      },
    );
  }
});

/* -------------------------------------------------------------------------- */
/* 2. Upstream failures (502)                                                  */
/* -------------------------------------------------------------------------- */

test('fetch is called with the correct API URL and a timeout signal', async () => {
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
        .post('/convert')
        .send({ url: articleUrl });

      assert.equal(response.status, 200);
      assert.equal(seenUrl, apiUrl);
      assert.ok(seenSignal instanceof AbortSignal);
    },
  );
});

test('POST /convert returns 502 when upstream responds with a non-OK status', async () => {
  await withMockedFetch(
    (async () => ({ ok: false, status: 500 }) as Response) as typeof fetch,
    async () => {
      const response = await request(buildApp())
        .post('/convert')
        .send({ url: articleUrl });

      assert.equal(response.status, 502);
      assert.equal(response.body.error, 'Bad gateway');
      assert.equal(response.body.message, 'Failed to load article.');
    },
  );
});

test('POST /convert returns 502 when fetch throws', async () => {
  await withMockedFetch(
    (async () => {
      throw new Error('network timeout');
    }) as typeof fetch,
    async () => {
      const response = await request(buildApp())
        .post('/convert')
        .send({ url: articleUrl });

      assert.equal(response.status, 502);
      assert.equal(response.body.message, 'Failed to load article.');
    },
  );
});

test('POST /convert returns 502 when response.json() throws', async () => {
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
        .post('/convert')
        .send({ url: articleUrl });

      assert.equal(response.status, 502);
      assert.equal(response.body.message, 'Failed to load article.');
    },
  );
});

test('POST /convert returns 502 when the article payload is invalid', async () => {
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
        .post('/convert')
        .send({ url: articleUrl });

      assert.equal(response.status, 502, name);
      assert.equal(response.body.error, 'Bad gateway', name);
      assert.equal(response.body.message, 'Invalid article response.', name);
    });
  }
});

test('Content of exactly 2,000,000 chars is accepted', async () => {
  const response = await convertWith({ Content: 'A'.repeat(2_000_000) });

  assert.equal(response.status, 200);
});

test('Content over 2,000,000 chars returns 502 Invalid article response.', async () => {
  const response = await convertWith({ Content: 'A'.repeat(2_000_001) });

  assert.equal(response.status, 502);
  assert.equal(response.body.message, 'Invalid article response.');
});

/* -------------------------------------------------------------------------- */
/* 3. Request-level errors (errorHandler / app)                                */
/* -------------------------------------------------------------------------- */

test('POST /convert returns 400 when request body is malformed JSON', async () => {
  const response = await request(buildApp())
    .post('/convert')
    .set('Content-Type', 'application/json')
    .send('{not valid json');

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'Validation failed');
});

test('POST /convert returns 413 for oversized JSON bodies', async () => {
  const response = await request(buildApp())
    .post('/convert')
    .send({
      url: articleUrl,
      payload: 'x'.repeat(1024 * 1024 + 1),
    });

  assert.equal(response.status, 413);
  assert.equal(response.body.error, 'Payload too large');
});

test('GET /missing-route returns 404', async () => {
  const response = await request(buildApp()).get('/missing-route');

  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'Route not found');
});

test('unexpected errors return the generic 500 response without leaking details', async () => {
  const app = express();
  app.use(express.json());
  app.get('/_boom', () => {
    throw new Error('top-secret-stack-trace');
  });
  app.use(errorHandler);

  const response = await request(app).get('/_boom');

  assert.equal(response.status, 500);
  assert.equal(response.body.error, 'Internal server error');
  assert.equal(response.body.message, 'Something went wrong. Please try again later.');
  assert.equal(response.text.includes('top-secret-stack-trace'), false);
});

/* -------------------------------------------------------------------------- */
/* 4. Successful responses and content negotiation                             */
/* -------------------------------------------------------------------------- */

test('POST /convert with Accept: application/json returns 200 and article metadata', async () => {
  const response = await convertWith({
    Id: '1986936',
    ArticleType: 'Article',
    Views: 42,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'success');
  assert.equal(response.body.sourceUrl, articleUrl);
  assert.equal(response.body.contentType, 'text/markdown');
  assert.equal(response.body.article.id, '1986936');
  assert.match(response.body.markdown, /^---/);
  assert.match(response.body.markdown, /Sample article/i);
});

test('POST /convert with no Accept returns Markdown', async () => {
  await withMockedFetch(
    (async () => successResponse()) as typeof fetch,
    async () => {
      const response = await request(buildApp())
        .post('/convert')
        .send({ url: articleUrl });

      assert.equal(response.status, 200);
      assert.match(response.headers['content-type'], /text\/markdown/);
      assert.match(response.text, /^---\nstatus: success/);
      assert.match(response.text, /\*\*world\*\*/);
    },
  );
});

test('POST /convert returns Markdown for Accept: */* and text/markdown', async () => {
  for (const accept of ['*/*', 'text/markdown']) {
    const response = await convertWith({}, accept);

    assert.equal(response.status, 200, accept);
    assert.match(response.headers['content-type'], /text\/markdown/, accept);
    assert.match(response.text, /^---/, accept);
  }
});

test('POST /convert returns 406 for unsupported Accept types', async () => {
  const response = await convertWith({}, 'text/html');

  assert.equal(response.status, 406);
  assert.equal(response.body.error, 'Not acceptable');
});

test('POST /convert sets the Vary: Accept header', async () => {
  const response = await convertWith();

  assert.equal(response.status, 200);
  assert.match(response.headers.vary, /Accept/i);
});

test('GET /articles returns Markdown and the s-maxage cache header', async () => {
  await withMockedFetch(
    (async () => successResponse()) as typeof fetch,
    async () => {
      const response = await request(buildApp())
        .get('/articles')
        .query({ url: articleUrl });

      assert.equal(response.status, 200);
      assert.match(response.headers['cache-control'], /s-maxage=31536000/);
      assert.match(response.text, /^---/);
      assert.match(response.text, /Hello/);
    },
  );
});

test('title falls back to Article <id> when Title is missing', async () => {
  const response = await convertWith({ Title: '', Id: '1986936' });

  assert.equal(response.status, 200);
  assert.equal(response.body.article.title, 'Article 1986936');
});

test('products and versions appear in article.products and the front matter', async () => {
  const response = await convertWith({
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

test('createdAt and updatedAt are ISO strings, or null when missing', async () => {
  const withDates = await convertWith({
    CreatedTime: 1750797136000,
    LastContentUpdateTime: 1791332026282,
  });

  assert.equal(withDates.body.article.createdAt, new Date(1750797136000).toISOString());
  assert.equal(withDates.body.article.updatedAt, new Date(1791332026282).toISOString());

  const withoutDates = await convertWith();

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

test('attachments: relative url resolves to the OpenText origin', async () => {
  const response = await convertWith({
    Attachments: [attachment({ url: '/files/a.pdf' })],
  });

  assert.equal(response.status, 200);
  assert.equal(
    response.body.article.attachments[0].url,
    'https://my.opentext.com/files/a.pdf',
  );
});

test('attachments: same-origin absolute url is kept', async () => {
  const response = await convertWith({
    Attachments: [attachment({ url: 'https://my.opentext.com/files/same.pdf' })],
  });

  assert.equal(
    response.body.article.attachments[0].url,
    'https://my.opentext.com/files/same.pdf',
  );
});

test('attachments: foreign-origin url becomes null and is not in the Markdown', async () => {
  const response = await convertWith({
    Attachments: [attachment({ name: 'foreign.pdf', url: 'https://evil.com/f.pdf' })],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.article.attachments[0].url, null);
  assert.doesNotMatch(response.body.markdown, /evil\.com/);
  assert.match(response.body.markdown, /foreign\.pdf/);
});

// Requires the safeAttachmentUrl fix that also checks fileUrl's origin.
test('attachments: foreign-origin fileUrl becomes null', async () => {
  const response = await convertWith({
    Attachments: [
      attachment({ name: 'ext.pdf', fileUrl: 'https://evil.com/f.pdf', isExternalAttachment: true }),
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.article.attachments[0].url, null);
  assert.doesNotMatch(response.body.markdown, /evil\.com/);
});

test('attachments: malformed url does not crash the request', async () => {
  const response = await convertWith({
    Attachments: [attachment({ name: 'bad.pdf', url: 'http://[bad' })],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.article.attachments[0].url, null);
  assert.match(response.body.markdown, /bad\.pdf/);
});

test('attachments: brackets in the name are escaped in the Markdown link', async () => {
  const response = await convertWith({
    Attachments: [attachment({ name: 'a[1].pdf', url: '/files/a.pdf' })],
  });

  assert.match(response.body.markdown, /\[a\\\[1\\\]\.pdf\]\(</);
});

test('attachments: size is rendered in KB in the Markdown link', async () => {
  const response = await convertWith({
    Attachments: [attachment({ url: '/files/a.pdf', size: 2048 })],
  });

  assert.match(response.body.markdown, /\(2\.0 KB\)/);
});

test('attachments: the Attachments section appears only when attachments exist', async () => {
  const withAttachments = await convertWith({
    Attachments: [attachment({ url: '/files/a.pdf' })],
  });
  assert.match(withAttachments.body.markdown, /## Attachments/);

  const withoutAttachments = await convertWith({ Attachments: [] });
  assert.doesNotMatch(withoutAttachments.body.markdown, /## Attachments/);

  const notAnArray = await convertWith({ Attachments: 'nope' });
  assert.equal(notAnArray.status, 200);
  assert.doesNotMatch(notAnArray.body.markdown, /## Attachments/);
});

/* -------------------------------------------------------------------------- */
/* 6. Live smoke test (real OpenText API). Run with: LIVE=1 npm test           */
/* -------------------------------------------------------------------------- */

test(
  'live: real article 1986936 converts to Markdown',
  { skip: !process.env.LIVE, timeout: 20000 },
  async () => {
    const response = await request(buildApp())
      .post('/convert')
      .set('Accept', 'application/json')
      .send({ url: articleUrl });

    assert.equal(response.status, 200);
    assert.equal(response.body.article.id, '1986936');
    assert.match(response.body.markdown, /^---\nstatus: success/);
  },
);