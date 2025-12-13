/**
 * Test Express App
 * Minimal app setup for integration testing without server startup
 */

import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';

// Import routes
import gateRoutes from '../../src/routes/gateRoutes';
import authRoutes from '../../src/routes/authRoutes';
import chatRoutes from '../../src/routes/chatRoutes';
import sessionRoutes from '../../src/routes/sessionRoutes';

const createTestApp = () => {
  const app = express();

  // Trust proxy for rate limiter
  app.set('trust proxy', 1);

  // Cookie Parser
  app.use(cookieParser());

  // JSON Parser
  app.use(express.json({ limit: '1mb' }));

  // Simplified CSRF for testing - just set cookie if not present
  // Tests can provide both cookie and header to pass CSRF check
  app.use((req, res, next) => {
    const csrfHeader = req.header('x-csrf-token');
    const csrfCookie = req.cookies?.csrfToken;
    const method = req.method.toUpperCase();
    const requiresCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    // Issue a CSRF token if none present
    if (!csrfCookie) {
      const token = 'test-csrf-token';
      res.cookie('csrfToken', token, {
        httpOnly: false,
        sameSite: 'lax',
        secure: false,
        path: '/',
      });

      // Reject state-changing requests without a token
      if (requiresCsrf) {
        return res.status(403).json({ error: 'CSRF token required' });
      }

      return next();
    }

    // For state-changing requests, require header to match cookie
    if (requiresCsrf && csrfHeader !== csrfCookie) {
      return res.status(403).json({ error: 'CSRF token mismatch' });
    }

    next();
  });

  // Mount routes
  app.use('/api/gate', gateRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/sessions', sessionRoutes);

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    const statusCode = res.statusCode >= 400 ? res.statusCode : 500;
    res.status(statusCode).json({
      error: 'Internal server error',
      message: err.message,
    });
  });

  return app;
};

export const app = createTestApp();
export default app;
