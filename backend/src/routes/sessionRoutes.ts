import { Router } from 'express';
import { createSession, getUserSessions, getSessionById, deleteSession } from '../controllers/sessionController';
import { authMiddleware } from '../middleware/authMiddleware';
import { createRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// Apply authentication middleware to all session routes
router.use(authMiddleware);

// POST /api/sessions - Create new session
router.post('/', createRateLimiter({ windowMs: 60_000, max: 100, routeName: 'session_create' }), createSession);

// GET /api/sessions - Get all sessions
router.get('/', createRateLimiter({ windowMs: 60_000, max: 300, routeName: 'session_list' }), getUserSessions);

// GET /api/sessions/:sessionId - Get specific session details
router.get('/:sessionId', createRateLimiter({ windowMs: 60_000, max: 600, routeName: 'session_get' }), getSessionById);

// DELETE /api/sessions/:sessionId - Delete a session
router.delete('/:sessionId', createRateLimiter({ windowMs: 60_000, max: 200, routeName: 'session_delete' }), deleteSession);

export default router;
