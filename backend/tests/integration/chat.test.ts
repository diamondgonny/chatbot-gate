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
  describe('POST /api/chat/message - Send Message', () => {
    describe('Successful Message', () => {
      it('should send message to existing session', async () => {
        const userId = generateUserId();
        const sessionId = await createTestSession(userId);

        const response = await request(app)
          .post('/api/chat/message')
          .set(withAuth(userId))
          .send({ message: 'Hello, AI!', sessionId });

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
          .post('/api/chat/message')
          .set(withAuth(userId))
          .send({ message: 'Hello!', sessionId: newSessionId });

        expect(response.status).toBe(200);
        expect(response.body.response).toBeDefined();

        // Verify session was created
        const sessionResponse = await request(app)
          .get(`/api/sessions/${newSessionId}`)
          .set(withAuth(userId));

        expect(sessionResponse.status).toBe(200);
      });
    });

    describe('Validation Errors', () => {
      it('should return 400 when message is missing', async () => {
        const userId = generateUserId();
        const sessionId = generateSessionId();

        const response = await request(app)
          .post('/api/chat/message')
          .set(withAuth(userId))
          .send({ sessionId });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Message');
      });

      it('should return 400 when message is empty', async () => {
        const userId = generateUserId();
        const sessionId = generateSessionId();

        const response = await request(app)
          .post('/api/chat/message')
          .set(withAuth(userId))
          .send({ message: '', sessionId });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('should return 413 when message exceeds 4000 characters', async () => {
        const userId = generateUserId();
        const sessionId = generateSessionId();
        const longMessage = 'a'.repeat(4001);

        const response = await request(app)
          .post('/api/chat/message')
          .set(withAuth(userId))
          .send({ message: longMessage, sessionId });

        expect(response.status).toBe(413);
        expect(response.body.error).toContain('too long');
      });

      it('should return 400 when sessionId is missing', async () => {
        const userId = generateUserId();

        const response = await request(app)
          .post('/api/chat/message')
          .set(withAuth(userId))
          .send({ message: 'Hello' });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('session ID');
      });

      it('should return 400 for invalid sessionId format', async () => {
        const userId = generateUserId();
        const invalidSessionId = generateInvalidSessionId();

        const response = await request(app)
          .post('/api/chat/message')
          .set(withAuth(userId))
          .send({ message: 'Hello', sessionId: invalidSessionId });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('session ID');
      });
    });

    describe('Authentication', () => {
      it('should return 401 without authentication', async () => {
        const sessionId = generateSessionId();

        const response = await request(app)
          .post('/api/chat/message')
          .set('Cookie', 'csrfToken=test-csrf-token')
          .set('x-csrf-token', 'test-csrf-token')
          .send({ message: 'Hello', sessionId });

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
          .post('/api/chat/message')
          .set(withAuth(userId))
          .send({ message: 'Hello', sessionId: newSessionId });

        expect(response.status).toBe(429);
        expect(response.body).toMatchObject({
          code: 'SESSION_LIMIT_REACHED',
          limit: 300,
        });
      }, 60000); // Extended timeout
    });
  });

  describe('GET /api/chat/history - Get Chat History', () => {
    describe('Successful Retrieval', () => {
      it('should return chat history for session', async () => {
        const userId = generateUserId();
        const sessionId = await createTestSession(userId, {
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'ai', content: 'Hi there!' },
          ],
        });

        const response = await request(app)
          .get('/api/chat/history')
          .query({ sessionId })
          .set(withAuth(userId));

        expect(response.status).toBe(200);
        expect(response.body.messages).toBeDefined();
        expect(Array.isArray(response.body.messages)).toBe(true);
        expect(response.body.messages.length).toBe(2);
        expect(response.body.messages[0]).toMatchObject({
          role: 'user',
          content: 'Hello',
        });
      });

      it('should return empty messages for session with no messages', async () => {
        const userId = generateUserId();
        const sessionId = await createTestSession(userId);

        const response = await request(app)
          .get('/api/chat/history')
          .query({ sessionId })
          .set(withAuth(userId));

        expect(response.status).toBe(200);
        expect(response.body.messages).toEqual([]);
      });

      it('should return empty messages for non-existent session', async () => {
        const userId = generateUserId();
        const nonExistentSessionId = generateSessionId();

        const response = await request(app)
          .get('/api/chat/history')
          .query({ sessionId: nonExistentSessionId })
          .set(withAuth(userId));

        expect(response.status).toBe(200);
        expect(response.body.messages).toEqual([]);
      });
    });

    describe('Validation Errors', () => {
      it('should return 400 when sessionId is missing', async () => {
        const userId = generateUserId();

        const response = await request(app)
          .get('/api/chat/history')
          .set(withAuth(userId));

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('session ID');
      });

      it('should return 400 for invalid sessionId format', async () => {
        const userId = generateUserId();
        const invalidSessionId = generateInvalidSessionId();

        const response = await request(app)
          .get('/api/chat/history')
          .query({ sessionId: invalidSessionId })
          .set(withAuth(userId));

        expect(response.status).toBe(400);
      });
    });

    describe('Authentication', () => {
      it('should return 401 without authentication', async () => {
        const sessionId = generateSessionId();

        const response = await request(app)
          .get('/api/chat/history')
          .query({ sessionId })
          .set('Cookie', 'csrfToken=test-csrf-token');

        expect(response.status).toBe(401);
      });
    });
  });
});
