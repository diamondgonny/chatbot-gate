import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// GET /api/auth/status - verifies JWT and returns userId
router.get('/status', authMiddleware, (req, res) => {
  res.json({ authenticated: true, userId: req.userId });
});

export default router;
