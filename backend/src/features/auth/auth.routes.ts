import { Router } from 'express';
import { verifyToken } from '../../shared';

const router = Router();

// GET /api/auth/status - soft check: returns authenticated flag (never 401)
router.get('/status', (req, res) => {
  const token = req.cookies?.jwt;

  if (!token) {
    return res.json({ authenticated: false });
  }

  try {
    const payload = verifyToken(token);
    return res.json({ authenticated: true, userId: payload.userId });
  } catch (_err) {
    return res.json({ authenticated: false });
  }
});

export default router;
