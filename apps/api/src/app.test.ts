import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './app.js';

describe('API Server Endpoints', () => {
  it('GET /api/health returns health status', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('app', 'CookOut AI Backend API');
    expect(response.body).toHaveProperty('domainPackage', '@cookout-ai/domain');
  });
});
