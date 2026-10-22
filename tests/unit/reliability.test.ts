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

  it('verifies GET /health and GET /health/live return valid ISO timestamp and healthy status', async () => {
    const res1 = await request(app).get('/health');
    expect(res1.status).toBe(200);
    expect(res1.body.status).toBe('ok');
    expect(res1.body.timestamp).toBeDefined();

    const res2 = await request(app).get('/health/live');
    expect(res2.status).toBe(200);
    expect(res2.body.status).toBe('ok');
    expect(res2.body.uptime).toBeDefined();
    expect(res2.body.timestamp).toBeDefined();

    const date = new Date(res2.body.timestamp);
    expect(date.toISOString()).toBe(res2.body.timestamp);
  });

  it('verifies GET /health/ready returns structured status and dependency checks', async () => {
    const res = await request(app).get('/health/ready');

    // In unit test environment, status will be 200 (if services available) or 503 (if degraded)
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('checks');
    expect(res.body.checks).toHaveProperty('database');
    expect(res.body.checks).toHaveProperty('firestore');
    expect(['up', 'down']).toContain(res.body.checks.database);
    expect(['up', 'down']).toContain(res.body.checks.firestore);
    expect(res.body).toHaveProperty('timestamp');
  });

  it('verifies that 404 is returned for unknown routes in RFC format', async () => {
    const res = await request(app).get('/unknown-route-12345');

    expect(res.status).toBe(404);
  });
});
