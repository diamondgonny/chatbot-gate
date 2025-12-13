/**
 * Gate API Integration Tests
 * Tests for POST /api/gate/validate endpoint
 */

import request from 'supertest';
import app from '../helpers/testApp';
import { withCsrf, getCsrfToken } from '../helpers/authHelper';

describe('Gate API - POST /api/gate/validate', () => {
  // Reset rate limiter and backoff state between tests
  // Note: Since gateService uses module-level state, we need to be careful about test isolation
  // Using different IPs for each test to avoid state interference

  describe('Successful Authentication', () => {
    it('should return 200 with valid code', async () => {
      const response = await request(app)
        .post('/api/gate/validate')
        .set(withCsrf())
        .set('X-Forwarded-For', '1.1.1.1')
        .send({ code: 'testcode' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        valid: true,
        message: 'Access granted',
      });
      expect(response.body.userId).toBeDefined();
      expect(response.body.userId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should set JWT cookie on successful auth', async () => {
      const response = await request(app)
        .post('/api/gate/validate')
        .set(withCsrf())
        .set('X-Forwarded-For', '1.1.1.2')
        .send({ code: 'testcode' });

      expect(response.status).toBe(200);

      const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
      expect(cookies).toBeDefined();

      const jwtCookie = cookies?.find((c: string) => c.startsWith('jwt='));
      expect(jwtCookie).toBeDefined();
      expect(jwtCookie).toContain('HttpOnly');
    });

    it('should reuse existing userId if provided', async () => {
      const existingUserId = '12345678-1234-4123-8123-123456789abc';

      const response = await request(app)
        .post('/api/gate/validate')
        .set(withCsrf())
        .set('X-Forwarded-For', '1.1.1.3')
        .send({ code: 'testcode', userId: existingUserId });

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(existingUserId);
    });
  });

  describe('Failed Authentication', () => {
    it('should return 401 with invalid code', async () => {
      const response = await request(app)
        .post('/api/gate/validate')
        .set(withCsrf())
        .set('X-Forwarded-For', '2.2.2.1')
        .send({ code: 'wrongcode' });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        valid: false,
        message: 'Invalid code',
      });
    });

    it('should return 400 when code is missing', async () => {
      const response = await request(app)
        .post('/api/gate/validate')
        .set(withCsrf())
        .set('X-Forwarded-For', '2.2.2.2')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        valid: false,
        message: 'Code is required',
      });
    });
  });

  describe('Backoff Mechanism', () => {
    it('should trigger backoff after 5 failed attempts', async () => {
      const testIp = '3.3.3.1';

      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/gate/validate')
          .set(withCsrf())
          .set('X-Forwarded-For', testIp)
          .send({ code: 'wrongcode' });
      }

      // 6th attempt should be blocked
      const response = await request(app)
        .post('/api/gate/validate')
        .set(withCsrf())
        .set('X-Forwarded-For', testIp)
        .send({ code: 'wrongcode' });

      expect(response.status).toBe(429);
      expect(response.body).toMatchObject({
        code: 'GATE_BACKOFF',
      });
      expect(response.body.retryAfter).toBeDefined();
      expect(response.body.retryAfter).toBeLessThanOrEqual(30);
    });

    it('should return Retry-After header during backoff', async () => {
      const testIp = '3.3.3.2';

      // Trigger backoff
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/gate/validate')
          .set(withCsrf())
          .set('X-Forwarded-For', testIp)
          .send({ code: 'wrongcode' });
      }

      const response = await request(app)
        .post('/api/gate/validate')
        .set(withCsrf())
        .set('X-Forwarded-For', testIp)
        .send({ code: 'testcode' }); // Even valid code should be blocked

      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBeDefined();
    });

    it('should block even valid code during backoff', async () => {
      const testIp = '3.3.3.3';

      // Trigger backoff
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/gate/validate')
          .set(withCsrf())
          .set('X-Forwarded-For', testIp)
          .send({ code: 'wrongcode' });
      }

      // Try with valid code - should still be blocked
      const response = await request(app)
        .post('/api/gate/validate')
        .set(withCsrf())
        .set('X-Forwarded-For', testIp)
        .send({ code: 'testcode' });

      expect(response.status).toBe(429);
      expect(response.body.code).toBe('GATE_BACKOFF');
    });
  });

  describe('Rate Limiting', () => {
    it('should return rate limit headers', async () => {
      const response = await request(app)
        .post('/api/gate/validate')
        .set(withCsrf())
        .set('X-Forwarded-For', '4.4.4.1')
        .send({ code: 'testcode' });

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });

    it('should return 429 when rate limit exceeded', async () => {
      const testIp = '4.4.4.2';

      // Make 10 requests (rate limit is 10/min)
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/gate/validate')
          .set(withCsrf())
          .set('X-Forwarded-For', testIp)
          .send({ code: 'testcode' });
      }

      // 11th request should be rate limited
      const response = await request(app)
        .post('/api/gate/validate')
        .set(withCsrf())
        .set('X-Forwarded-For', testIp)
        .send({ code: 'testcode' });

      expect(response.status).toBe(429);
      expect(response.body.error).toContain('Too many requests');
      expect(response.headers['retry-after']).toBeDefined();
    });
  });

  describe('CSRF Protection', () => {
    it('should return 403 without CSRF token', async () => {
      const response = await request(app)
        .post('/api/gate/validate')
        .set('X-Forwarded-For', '5.5.5.1')
        .send({ code: 'testcode' });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('CSRF');
    });
  });
});
