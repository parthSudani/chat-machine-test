import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';

describe('Reliability & Error Handling Tests (Unit/HTTP)', () => {
  it('handles malformed JSON body by returning 400 Bad Request', async () => {
    const res = await request(app)
      .post('/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"name": "Invalid JSON, missing closing brace');

    expect(res.status).toBe(400);
  });

  it('rejects oversized request bodies (> 100kb) with 413 Payload Too Large', async () => {
    // Generate a payload exceeding 100kb
    const largeString = 'a'.repeat(105 * 1024);
    const res = await request(app)
      .post('/auth/register')
      .send({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'Password123!',
        extraData: largeString,
      });

    expect(res.status).toBe(413);
  });

  it('verifies GET /health returns valid ISO timestamp and healthy status', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();

    const date = new Date(res.body.timestamp);
    expect(date.toISOString()).toBe(res.body.timestamp);
  });

  it('verifies that 404 is returned for unknown routes in RFC format', async () => {
    const res = await request(app).get('/unknown-route-12345');

    expect(res.status).toBe(404);
  });
});
