import { Router } from 'express';
import { chatWithAI } from '../controllers/chatController';

const router = Router();

// POST /api/chat/message
// Receives: { "message": "Hello" }
// Returns: { "response": "...", "timestamp": "..." }
router.post('/message', chatWithAI);

export default router;
