import { Router } from 'express';
import { chatWithAI, getChatHistory } from './chat.controller';
import { authMiddleware, createRateLimiter } from '../../shared';

const router = Router();

// Apply authentication middleware to all chat routes
router.use(authMiddleware);

// POST /api/chat/message
// Receives: { "message": "Hello" }
// JWT token expected in Authorization header
// Returns: { "response": "...", "timestamp": "..." }
router.post('/message', createRateLimiter({ windowMs: 60_000, max: 20, routeName: 'chat_message' }), chatWithAI);

// GET /api/chat/history
// JWT token expected in Authorization header
// Returns: { "messages": [...] }
router.get('/history', createRateLimiter({ windowMs: 60_000, max: 60, routeName: 'chat_history' }), getChatHistory);

export default router;
