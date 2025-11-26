import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwtUtils';

// Extend Express Request interface to include sessionId
declare global {
  namespace Express {
    interface Request {
      sessionId?: string;
    }
  }
}

/**
 * JWT Authentication Middleware
 * Verifies JWT token from Authorization header and attaches sessionId to request
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Extract token from Authorization header (Bearer <token>)
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization token required' });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token and extract sessionId
    const payload = verifyToken(token);
    
    // Attach sessionId to request object for use in controllers
    req.sessionId = payload.sessionId;
    
    next();
  } catch (error) {
    if (error instanceof Error) {
      res.status(401).json({ error: error.message });
    } else {
      res.status(401).json({ error: 'Authentication failed' });
    }
  }
};
