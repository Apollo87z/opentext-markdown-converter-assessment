import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import app from '../src/app';

test('GET /api/v1/health returns the service status', async () => {
  const response = await request(app).get('/api/v1/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});

test('GET /api/v1/health responds with JSON content type', async () => {
  const response = await request(app).get('/api/v1/health');

  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
});
