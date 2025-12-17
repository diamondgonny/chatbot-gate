/**
 * Chat API Integration Tests
 * Tests for /api/chat endpoints
 */

import request from 'supertest';
import app from '../helpers/testApp';
import { withAuth, generateUserId } from '../helpers/authHelper';
import {
  createTestSession,
  createManySessions,
  generateSessionId,
  generateInvalidSessionId,
} from '../helpers/dbHelper';

describe('Chat API', () => {
  describe('POST /api/chat/sessions/:sessionId/message - Send Message', () => {
    describe('Successful Message', () => {
      it('should send message to existing session', async () => {
        const userId = generateUserId();
        const sessionId = await createTestSession(userId);

        const response = await request(app)
          .post(`/api/chat/sessions/${sessionId}/message`)
          .set(withAuth(userId))
          .send({ message: 'Hello, AI!' });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          response: expect.any(String),
          timestamp: expect.any(String),
        });
      });

      it('should auto-create session if it does not exist', async () => {
        const userId = generateUserId();
        const newSessionId = generateSessionId();

        const response = await request(app)
          .post(`/api/chat/sessions/${newSessionId}/message`)
          .set(withAuth(userId))
          .send({ message: 'Hello!' });

        expect(response.status).toBe(200);
        expect(response.body.response).toBeDefined();

        // Verify session was created
        const sessionResponse = await request(app)
          .get(`/api/chat/sessions/${newSessionId}`)
          .set(withAuth(userId));

        expect(sessionResponse.status).toBe(200);
      });
    });

    describe('Validation Errors', () => {
      it('should return 400 when message is missing', async () => {
        const userId = generateUserId();
        const sessionId = generateSessionId();

        const response = await request(app)
          .post(`/api/chat/sessions/${sessionId}/message`)
          .set(withAuth(userId))
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Message');
      });

      it('should return 400 when message is empty', async () => {
        const userId = generateUserId();
        const sessionId = generateSessionId();

        const response = await request(app)
          .post(`/api/chat/sessions/${sessionId}/message`)
          .set(withAuth(userId))
          .send({ message: '' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('should return 413 when message exceeds 4000 characters', async () => {
        const userId = generateUserId();
        const sessionId = generateSessionId();
        const longMessage = 'a'.repeat(4001);

        const response = await request(app)
          .post(`/api/chat/sessions/${sessionId}/message`)
          .set(withAuth(userId))
          .send({ message: longMessage });

        expect(response.status).toBe(413);
        expect(response.body.error).toContain('too long');
      });

      it('should return 400 for invalid sessionId format', async () => {
        const userId = generateUserId();
        const invalidSessionId = generateInvalidSessionId();

        const response = await request(app)
          .post(`/api/chat/sessions/${invalidSessionId}/message`)
          .set(withAuth(userId))
          .send({ message: 'Hello' });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('session ID');
      });
    });

    describe('Authentication', () => {
      it('should return 401 without authentication', async () => {
        const sessionId = generateSessionId();

        const response = await request(app)
          .post(`/api/chat/sessions/${sessionId}/message`)
          .set('Cookie', 'csrfToken=test-csrf-token')
          .set('x-csrf-token', 'test-csrf-token')
          .send({ message: 'Hello' });

        expect(response.status).toBe(401);
      });
    });

    describe('Session Limit', () => {
      // Note: This test creates 300 sessions which may be slow
      it('should return 429 when trying to create session at limit', async () => {
        const userId = generateUserId();

        // Create 300 sessions (the limit)
        await createManySessions(userId, 300);

        // Try to send message to a new session
        const newSessionId = generateSessionId();
        const response = await request(app)
          .post(`/api/chat/sessions/${newSessionId}/message`)
          .set(withAuth(userId))
          .send({ message: 'Hello' });

        expect(response.status).toBe(429);
        expect(response.body).toMatchObject({
          code: 'SESSION_LIMIT_REACHED',
          limit: 300,
        });
      }, 60000); // Extended timeout
    });
  });
});
