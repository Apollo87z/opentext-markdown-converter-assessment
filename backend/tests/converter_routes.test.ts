import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';

import router from '../src/routes/converter_routes';
import { errorHandler } from '../src/middleware/errorHandler';

const articleUrl = 'https://my.opentext.com/support/article/1986936';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use(errorHandler);
  return app;
};

// Replaces global.fetch for one test and always restores it afterwards.
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

test('POST /convert returns 400 when the url field is missing', async () => {
  const response = await request(buildApp()).post('/convert').send({});

  assert.equal(response.status, 400);
  assert.equal(response.body.status, 'error');
  assert.equal(response.body.error, 'Validation failed');
  assert.equal(response.body.message, 'The "url" field is required.');
});

test('POST /convert returns 400 when the URL does not contain an article id', async () => {
  const response = await request(buildApp())
    .post('/convert')
    .send({ url: 'https://my.opentext.com/support/article' });

  assert.equal(response.status, 400);
  assert.equal(response.body.message, 'Invalid article URL.');
});

test('POST /convert returns 502 when the upstream fetch fails', async () => {
  await withMockedFetch(
    async () => ({ ok: false, status: 500 }) as Response,
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

test('POST /convert returns 502 when no article content is returned', async () => {
  await withMockedFetch(
    async () =>
      ({
        ok: true,
        json: async () => ({ response: { Title: 'Example title' } }),
      }) as Response,
    async () => {
      const response = await request(buildApp())
        .post('/convert')
        .send({ url: articleUrl });

      assert.equal(response.status, 502);
      assert.equal(response.body.message, 'Failed to load article.');
    },
  );
});

test('POST /convert returns JSON with the fallback title when Accept is application/json', async () => {
  await withMockedFetch(
    async () =>
      ({
        ok: true,
        json: async () => ({
          response: {
            Content:
              '<h1>Sample article</h1><p>Hello <strong>world</strong>!</p>',
          },
        }),
      }) as Response,
    async () => {
      const response = await request(buildApp())
        .post('/convert')
        .set('Accept', 'application/json')
        .send({ url: articleUrl });

      assert.equal(response.status, 200);
      assert.equal(response.body.status, 'success');
      assert.equal(response.body.sourceUrl, articleUrl);
      assert.equal(response.body.contentType, 'text/markdown');
      assert.equal(response.body.article.title, 'Article 1986936');
      assert.match(response.body.markdown, /Sample article/i);
      assert.match(response.body.markdown, /Hello/i);
      assert.match(response.body.markdown, /\*\*world\*\*/);
    },
  );
});

test('POST /convert returns Markdown with front matter by default', async () => {
  await withMockedFetch(
    async () =>
      ({
        ok: true,
        json: async () => ({
          response: { Content: '<p>Hello <strong>world</strong></p>' },
        }),
      }) as Response,
    async () => {
      const response = await request(buildApp())
        .post('/convert')
        .send({ url: articleUrl });

      assert.equal(response.status, 200);
      assert.match(response.headers['content-type'], /text\/markdown/);
      assert.match(response.text, /^---\nstatus: success/);
      assert.match(response.text, /sourceUrl: "https:\/\/my\.opentext\.com/);
      assert.match(response.text, /\*\*world\*\*/);
    },
  );
});

test('POST /convert returns 406 for unsupported Accept types', async () => {
  await withMockedFetch(
    async () =>
      ({
        ok: true,
        json: async () => ({ response: { Content: '<p>Hi</p>' } }),
      }) as Response,
    async () => {
      const response = await request(buildApp())
        .post('/convert')
        .set('Accept', 'text/html')
        .send({ url: articleUrl });

      assert.equal(response.status, 406);
      assert.equal(response.body.error, 'Not acceptable');
    },
  );
});