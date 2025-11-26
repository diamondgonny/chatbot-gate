import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwtUtils';

// Extend Express Request interface to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * JWT Authentication Middleware
 * Verifies JWT token from cookie and attaches userId to request
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Extract token from cookie
    const token = req.cookies?.jwt;
    
    if (!token) {
      res.status(401).json({ error: 'Authentication token required' });
      return;
    }

    // Verify token and extract userId
    const payload = verifyToken(token);
    
    // Attach userId to request object for use in controllers
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
