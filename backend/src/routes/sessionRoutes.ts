import { Router } from 'express';
import { createSession, getUserSessions, getSessionById, deleteSession } from '../controllers/sessionController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Apply authentication middleware to all session routes
router.use(authMiddleware);

// POST /api/sessions - Create new session
router.post('/', createSession);

// GET /api/sessions - Get all sessions
router.get('/', getUserSessions);

// GET /api/sessions/:sessionId - Get specific session details
router.get('/:sessionId', getSessionById);

// DELETE /api/sessions/:sessionId - Delete a session
router.delete('/:sessionId', deleteSession);

export default router;
