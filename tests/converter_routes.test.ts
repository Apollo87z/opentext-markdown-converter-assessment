import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';

import router from '../src/routes/converter_routes';
import { errorHandler } from '../src/middleware/errorHandler';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use(errorHandler);

  return app;
};

test('POST /convert returns 400 when the url field is missing', async () => {
  const app = buildApp();

  const response = await request(app).post('/convert').send({});

  assert.equal(response.status, 400);
  assert.equal(response.body.status, 'error');
  assert.equal(response.body.error, 'Validation failed');
  assert.equal(response.body.message, 'The "url" field is required.');
});

test('POST /convert returns 400 when the URL does not contain an article id', async () => {
  const app = buildApp();

  const response = await request(app)
    .post('/convert')
    .send({ url: 'https://example.com/knowledge-base/article-not-found' });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'Validation failed');
  assert.equal(response.body.message, 'Invalid article URL.');
});

test('POST /convert returns 502 when the upstream fetch fails', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500 }) as Response;

  try {
    const app = buildApp();

    const response = await request(app)
      .post('/convert')
      .send({ url: 'https://example.com/article/123' });

    assert.equal(response.status, 502);
    assert.equal(response.body.error, 'Internal server error');
    assert.equal(response.body.message, 'Something went wrong on the server.');
  } finally {
    global.fetch = originalFetch;
  }
});

test('POST /convert returns 502 when no article content is returned', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ response: { Title: 'Example title' } }),
  }) as Response;

  try {
    const app = buildApp();

    const response = await request(app)
      .post('/convert')
      .send({ url: 'https://example.com/article/456' });

    assert.equal(response.status, 502);
    assert.equal(response.body.error, 'Internal server error');
    assert.equal(response.body.message, 'Something went wrong on the server.');
  } finally {
    global.fetch = originalFetch;
  }
});

test('POST /convert returns converted markdown and uses the fallback title when none is present', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      response: {
        Content: '<h1>Sample article</h1><p>Hello <strong>world</strong>!</p>',
      },
    }),
  }) as Response;

  try {
    const app = buildApp();

    const response = await request(app)
      .post('/convert')
      .send({ url: 'https://example.com/article/789' });

    assert.equal(response.status, 200);
    assert.equal(response.body.sourceUrl, 'https://example.com/article/789');
    assert.equal(response.body.contentType, 'text/markdown');
    assert.equal(response.body.title, 'Article 789');
    assert.match(response.body.markdown, /Sample article/i);
    assert.match(response.body.markdown, /Hello/i);
    assert.match(response.body.markdown, /\*\*world\*\*/i);
  } finally {
    global.fetch = originalFetch;
  }
});
