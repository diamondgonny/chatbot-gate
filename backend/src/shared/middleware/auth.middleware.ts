import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/jwt.service';

// Express Request 인터페이스 확장 (userId 추가)
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** JWT 인증 미들웨어 - 쿠키에서 JWT 검증 후 userId를 request에 첨부 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const token = req.cookies?.jwt;

    if (!token) {
      res.status(401).json({ error: 'Authentication token required' });
      return;
    }

    const payload = verifyToken(token);
    req.userId = payload.userId;

    next();
  } catch (error) {
    if (error instanceof Error) {
      res.status(401).json({ error: error.message });
    } else {
      res.status(401).json({ error: 'Authentication failed' });
    }
  }
};
