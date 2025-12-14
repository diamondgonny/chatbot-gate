/**
 * Session API Integration Tests
 * Tests for /api/chat/sessions endpoints
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

describe('Session API', () => {
  describe('POST /api/chat/sessions - Create Session', () => {
    it('should create a new session with valid auth', async () => {
      const userId = generateUserId();

      const response = await request(app)
        .post('/api/chat/sessions')
        .set(withAuth(userId));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        title: 'New Chat',
      });
      expect(response.body.sessionId).toBeDefined();
      expect(response.body.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      // Provide CSRF token but no JWT to test auth middleware
      const response = await request(app)
        .post('/api/chat/sessions')
        .set('Cookie', 'csrfToken=test-csrf-token')
        .set('x-csrf-token', 'test-csrf-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    // Note: This test creates 300 sessions which may be slow
    // Consider running with --testTimeout=60000 for this test
    it('should return 429 when session limit reached', async () => {
      const userId = generateUserId();

      // Create 300 sessions (the limit)
      await createManySessions(userId, 300);

      // Try to create one more
      const response = await request(app)
        .post('/api/chat/sessions')
        .set(withAuth(userId));

      expect(response.status).toBe(429);
      expect(response.body).toMatchObject({
        code: 'SESSION_LIMIT_REACHED',
        limit: 300,
      });
      expect(response.body.count).toBe(300);
    }, 60000); // Extended timeout for this test
  });

  describe('GET /api/chat/sessions - List Sessions', () => {
    it('should return list of sessions', async () => {
      const userId = generateUserId();

      // Create some test sessions
      await createTestSession(userId, { title: 'Session 1' });
      await createTestSession(userId, { title: 'Session 2' });

      const response = await request(app)
        .get('/api/chat/sessions')
        .set(withAuth(userId));

      expect(response.status).toBe(200);
      expect(response.body.sessions).toBeDefined();
      expect(Array.isArray(response.body.sessions)).toBe(true);
      expect(response.body.sessions.length).toBe(2);
    });

    it('should return empty array when no sessions exist', async () => {
      const userId = generateUserId();

      const response = await request(app)
        .get('/api/chat/sessions')
        .set(withAuth(userId));

      expect(response.status).toBe(200);
      expect(response.body.sessions).toEqual([]);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/chat/sessions')
        .set('Cookie', 'csrfToken=test-csrf-token');

      expect(response.status).toBe(401);
    });

    it('should only return sessions for the authenticated user', async () => {
      const userId1 = generateUserId();
      const userId2 = generateUserId();

      // Create sessions for both users
      await createTestSession(userId1, { title: 'User1 Session' });
      await createTestSession(userId2, { title: 'User2 Session' });

      // Get sessions for user1
      const response = await request(app)
        .get('/api/chat/sessions')
        .set(withAuth(userId1));

      expect(response.status).toBe(200);
      expect(response.body.sessions.length).toBe(1);
      expect(response.body.sessions[0].title).toBe('User1 Session');
    });
  });

  describe('GET /api/chat/sessions/:sessionId - Get Session', () => {
    it('should return session details', async () => {
      const userId = generateUserId();
      const sessionId = await createTestSession(userId, {
        title: 'Test Session',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'ai', content: 'Hi there!' },
        ],
      });

      const response = await request(app)
        .get(`/api/chat/sessions/${sessionId}`)
        .set(withAuth(userId));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        sessionId,
        title: 'Test Session',
      });
      expect(response.body.messages).toBeDefined();
      expect(response.body.messages.length).toBe(2);
    });

    it('should return 404 for non-existent session', async () => {
      const userId = generateUserId();
      const nonExistentSessionId = generateSessionId();

      const response = await request(app)
        .get(`/api/chat/sessions/${nonExistentSessionId}`)
        .set(withAuth(userId));

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should return 400 for invalid session ID format', async () => {
      const userId = generateUserId();
      const invalidSessionId = generateInvalidSessionId();

      const response = await request(app)
        .get(`/api/chat/sessions/${invalidSessionId}`)
        .set(withAuth(userId));

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Valid session ID');
    });

    it('should return 404 when accessing another user\'s session', async () => {
      const userId1 = generateUserId();
      const userId2 = generateUserId();

      // Create session for user1
      const sessionId = await createTestSession(userId1);

      // Try to access with user2
      const response = await request(app)
        .get(`/api/chat/sessions/${sessionId}`)
        .set(withAuth(userId2));

      // Should return 404 (not 403) to not reveal session existence
      expect(response.status).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const sessionId = generateSessionId();

      const response = await request(app)
        .get(`/api/chat/sessions/${sessionId}`)
        .set('Cookie', 'csrfToken=test-csrf-token');

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/chat/sessions/:sessionId - Delete Session', () => {
    it('should delete session successfully', async () => {
      const userId = generateUserId();
      const sessionId = await createTestSession(userId);

      const response = await request(app)
        .delete(`/api/chat/sessions/${sessionId}`)
        .set(withAuth(userId));

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('deleted');

      // Verify session is actually deleted
      const getResponse = await request(app)
        .get(`/api/chat/sessions/${sessionId}`)
        .set(withAuth(userId));

      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent session', async () => {
      const userId = generateUserId();
      const nonExistentSessionId = generateSessionId();

      const response = await request(app)
        .delete(`/api/chat/sessions/${nonExistentSessionId}`)
        .set(withAuth(userId));

      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid session ID format', async () => {
      const userId = generateUserId();
      const invalidSessionId = generateInvalidSessionId();

      const response = await request(app)
        .delete(`/api/chat/sessions/${invalidSessionId}`)
        .set(withAuth(userId));

      expect(response.status).toBe(400);
    });

    it('should return 401 without authentication', async () => {
      const sessionId = generateSessionId();

      const response = await request(app)
        .delete(`/api/chat/sessions/${sessionId}`)
        .set('Cookie', 'csrfToken=test-csrf-token')
        .set('x-csrf-token', 'test-csrf-token');

      expect(response.status).toBe(401);
    });
  });
});
