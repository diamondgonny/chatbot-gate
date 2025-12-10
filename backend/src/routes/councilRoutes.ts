import { Router } from 'express';
import {
  createSession,
  getSessions,
  getSession,
  deleteSession,
  sendMessage,
} from '../controllers/councilController';
import { authMiddleware } from '../middleware/authMiddleware';
import { createRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// Apply authentication middleware to all council routes
router.use(authMiddleware);

// POST /api/council/sessions - Create new session
router.post(
  '/sessions',
  createRateLimiter({ windowMs: 60_000, max: 10, routeName: 'council_create_session' }),
  createSession
);

// GET /api/council/sessions - List all sessions
router.get(
  '/sessions',
  createRateLimiter({ windowMs: 60_000, max: 60, routeName: 'council_list_sessions' }),
  getSessions
);

// GET /api/council/sessions/:sessionId - Get session detail
router.get(
  '/sessions/:sessionId',
  createRateLimiter({ windowMs: 60_000, max: 60, routeName: 'council_get_session' }),
  getSession
);

// DELETE /api/council/sessions/:sessionId - Delete session
router.delete(
  '/sessions/:sessionId',
  createRateLimiter({ windowMs: 60_000, max: 20, routeName: 'council_delete_session' }),
  deleteSession
);

// POST /api/council/sessions/:sessionId/message - Send message with SSE streaming
// Message content is passed in request body: { content: string }
router.post(
  '/sessions/:sessionId/message',
  createRateLimiter({ windowMs: 60_000, max: 10, routeName: 'council_send_message' }),
  sendMessage
);

export default router;
