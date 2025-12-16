import { Router } from 'express';
import {
  createSession,
  getSessions,
  getSession,
  deleteSession,
  sendChatMessage,
  getChatHistory,
} from '../controllers/chat.controller';
import { authMiddleware, createRateLimiter } from '../../../shared';

const router = Router();

// Apply authentication middleware to all chat routes
router.use(authMiddleware);

// POST /api/chat/sessions - Create new session
router.post(
  '/sessions',
  createRateLimiter({ windowMs: 60_000, max: 100, routeName: 'chat_session_create' }),
  createSession
);

// GET /api/chat/sessions - Get all sessions
router.get(
  '/sessions',
  createRateLimiter({ windowMs: 60_000, max: 300, routeName: 'chat_session_list' }),
  getSessions
);

// GET /api/chat/sessions/:sessionId - Get specific session details
router.get(
  '/sessions/:sessionId',
  createRateLimiter({ windowMs: 60_000, max: 600, routeName: 'chat_session_get' }),
  getSession
);

// DELETE /api/chat/sessions/:sessionId - Delete a session
router.delete(
  '/sessions/:sessionId',
  createRateLimiter({ windowMs: 60_000, max: 200, routeName: 'chat_session_delete' }),
  deleteSession
);

// POST /api/chat/sessions/:sessionId/message - Send message to AI
router.post(
  '/sessions/:sessionId/message',
  createRateLimiter({ windowMs: 60_000, max: 20, routeName: 'chat_message' }),
  sendChatMessage
);

// GET /api/chat/sessions/:sessionId/history - Get chat history for session
router.get(
  '/sessions/:sessionId/history',
  createRateLimiter({ windowMs: 60_000, max: 60, routeName: 'chat_history' }),
  getChatHistory
);

export default router;
