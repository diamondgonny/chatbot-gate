import { Router } from 'express';
import { chatWithAI, getChatHistory } from '../controllers/chatController';

const router = Router();

// POST /api/chat/message
// Receives: { "message": "Hello", "token": "..." }
// Returns: Streamed response
router.post('/message', chatWithAI);

// GET /api/chat/history?token=...
// Returns: { "messages": [...] }
router.get('/history', getChatHistory);

export default router;
