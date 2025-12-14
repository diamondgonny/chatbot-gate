/**
 * Express Application Factory
 * Creates Express app with configurable middleware for production and testing.
 */

import express, { Request, Response, NextFunction, Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'crypto';
import { cookieConfig } from './shared/config';
import { errorHandler } from './shared/middleware';

// Route imports
import { gateRoutes } from './features/gate';
import { authRoutes } from './features/auth';
import { chatRoutes } from './features/chat';
import { councilRoutes } from './features/council';
import { metricsRoutes, metricsMiddleware } from './features/metrics';

export interface AppOptions {
  /** Enable Morgan request logging (default: true) */
  enableLogging?: boolean;
  /** Enable metrics middleware and routes (default: true) */
  enableMetrics?: boolean;
  /** Enable CORS middleware (default: true) */
  enableCors?: boolean;
  /** Enable security headers (default: true) */
  enableSecurityHeaders?: boolean;
  /** Enable council feature routes (default: true) */
  enableCouncil?: boolean;
  /** Use simplified CSRF for testing (default: false) */
  testMode?: boolean;
}

/**
 * CSRF middleware factory
 * Production: crypto-generated token
 * Test: predictable static token
 */
const createCsrfMiddleware = (testMode: boolean) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const csrfHeader = req.header('x-csrf-token');
    const csrfCookie = req.cookies?.csrfToken;
    const method = req.method.toUpperCase();
    const requiresCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    // Issue a CSRF token if none present
    if (!csrfCookie) {
      const token = testMode
        ? 'test-csrf-token'
        : randomBytes(16).toString('hex');

      res.cookie('csrfToken', token, {
        httpOnly: false, // CSRF token must be readable by frontend
        sameSite: testMode ? 'lax' : cookieConfig.sameSite,
        secure: testMode ? false : cookieConfig.secure,
        domain: testMode ? undefined : cookieConfig.domain,
        maxAge: 24 * 60 * 60 * 1000,
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
  };
};

/**
 * Security headers middleware
 */
const securityHeadersMiddleware = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (!res.getHeader('Content-Security-Policy')) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self';"
    );
  }
  next();
};


/**
 * Create CORS configuration
 */
const createCorsConfig = () => {
  const allowedOrigins = (
    process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      if (!origin) return callback(null, true); // Allow non-browser tools
      if (allowedOrigins.length === 0) {
        return callback(new Error('CORS origin not configured'), false);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
    exposedHeaders: ['Set-Cookie'],
    maxAge: 86400,
  };
};

/**
 * Create Express application with configurable middleware
 *
 * @param options - Configuration options for middleware
 * @returns Configured Express application
 *
 * @example
 * // Production (default)
 * const app = createApp();
 *
 * @example
 * // Testing (minimal middleware)
 * const app = createApp({
 *   enableLogging: false,
 *   enableMetrics: false,
 *   enableCors: false,
 *   enableSecurityHeaders: false,
 *   enableCouncil: false,
 *   testMode: true,
 * });
 */
export const createApp = (options?: AppOptions): Express => {
  const {
    enableLogging = true,
    enableMetrics = true,
    enableCors = true,
    enableSecurityHeaders = true,
    enableCouncil = true,
    testMode = false,
  } = options ?? {};

  const app = express();

  // Trust proxy for correct client IP (rate limiting, logging)
  app.set('trust proxy', 1);

  // Metrics collection (must be early to capture all requests)
  if (enableMetrics) {
    app.use(metricsMiddleware);
  }

  // CORS
  if (enableCors) {
    app.use(cors(createCorsConfig()));
  }

  // Core middleware
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  // Security headers
  if (enableSecurityHeaders) {
    app.use(securityHeadersMiddleware);
  }

  // Request logging (requires external setup for file streaming)
  // Note: Morgan is conditionally imported and configured in index.ts
  // when enableLogging is true, to avoid file system operations in tests

  // CSRF protection
  app.use(createCsrfMiddleware(testMode));

  // Core API routes
  app.use('/api/gate', gateRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/chat', chatRoutes);

  // Council routes (SSE, complex state)
  if (enableCouncil) {
    app.use('/api/council', councilRoutes);
  }

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'Chatbot Gate Backend is running' });
  });

  // Metrics endpoint (internal)
  if (enableMetrics) {
    app.use('/metrics', metricsRoutes);
  }

  // Error handler
  app.use(errorHandler);

  return app;
};

/**
 * Create test application with minimal middleware
 */
export const createTestApp = (): Express => {
  return createApp({
    enableLogging: false,
    enableMetrics: false,
    enableCors: false,
    enableSecurityHeaders: false,
    enableCouncil: false,
    testMode: true,
  });
};
