import { Router } from 'express';
import {
  createSession,
  getSessions,
  getSession,
  deleteSession,
  sendMessage,
  getProcessingStatus,
  reconnectToProcessing,
  abortProcessing,
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

// GET /api/council/sessions/:sessionId/status - Check processing status
router.get(
  '/sessions/:sessionId/status',
  createRateLimiter({ windowMs: 60_000, max: 60, routeName: 'council_status' }),
  getProcessingStatus
);

// GET /api/council/sessions/:sessionId/reconnect - Reconnect to processing (SSE)
router.get(
  '/sessions/:sessionId/reconnect',
  createRateLimiter({ windowMs: 60_000, max: 20, routeName: 'council_reconnect' }),
  reconnectToProcessing
);

// POST /api/council/sessions/:sessionId/abort - Explicitly abort processing
router.post(
  '/sessions/:sessionId/abort',
  createRateLimiter({ windowMs: 60_000, max: 20, routeName: 'council_abort' }),
  abortProcessing
);

export default router;
