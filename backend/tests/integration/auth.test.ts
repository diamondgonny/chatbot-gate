/**
 * Auth API Integration Tests
 * Tests for GET /api/auth/status endpoint
 */

import request from 'supertest';
import app from '../helpers/testApp';
import {
  generateValidToken,
  generateExpiredToken,
  generateInvalidToken,
  generateUserId,
} from '../helpers/authHelper';

describe('Auth API - GET /api/auth/status', () => {
  describe('Authenticated Status', () => {
    it('should return authenticated: true with valid JWT', async () => {
      const userId = generateUserId();
      const token = generateValidToken(userId);

      const response = await request(app)
        .get('/api/auth/status')
        .set('Cookie', `jwt=${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        authenticated: true,
        userId: userId,
      });
    });
  });

  describe('Unauthenticated Status', () => {
    it('should return authenticated: false without JWT cookie', async () => {
      const response = await request(app).get('/api/auth/status');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        authenticated: false,
      });
      expect(response.body.userId).toBeUndefined();
    });

    it('should return authenticated: false with expired JWT', async () => {
      const token = generateExpiredToken();

      const response = await request(app)
        .get('/api/auth/status')
        .set('Cookie', `jwt=${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        authenticated: false,
      });
    });

    it('should return authenticated: false with invalid JWT', async () => {
      const token = generateInvalidToken();

      const response = await request(app)
        .get('/api/auth/status')
        .set('Cookie', `jwt=${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        authenticated: false,
      });
    });

    it('should return authenticated: false with malformed JWT', async () => {
      const response = await request(app)
        .get('/api/auth/status')
        .set('Cookie', 'jwt=not-a-valid-jwt-token');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        authenticated: false,
      });
    });
  });

  describe('Soft Check Behavior', () => {
    it('should never return 401 (soft check)', async () => {
      // Even with no auth, malformed token, or expired token
      // This endpoint should always return 200

      const testCases = [
        {}, // No cookie
        { Cookie: 'jwt=invalid' },
        { Cookie: `jwt=${generateExpiredToken()}` },
        { Cookie: `jwt=${generateInvalidToken()}` },
      ];

      for (const headers of testCases) {
        const response = await request(app)
          .get('/api/auth/status')
          .set(headers as Record<string, string>);

        expect(response.status).toBe(200);
      }
    });
  });
});
