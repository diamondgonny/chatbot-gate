import { Router } from 'express';
import { verifyToken } from '@shared';

const router = Router();

// GET /api/auth/status - soft check: 인증 상태 플래그 반환 (401 반환하지 않음)
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
