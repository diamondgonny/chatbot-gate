import { Router } from 'express';
import { chatWithAI, getChatHistory } from '../controllers/chatController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Apply authentication middleware to all chat routes
router.use(authMiddleware);

// POST /api/chat/message
// Receives: { "message": "Hello" }
// JWT token expected in Authorization header
// Returns: { "response": "...", "timestamp": "..." }
router.post('/message', chatWithAI);

// GET /api/chat/history
// JWT token expected in Authorization header
// Returns: { "messages": [...] }
router.get('/history', getChatHistory);

export default router;
