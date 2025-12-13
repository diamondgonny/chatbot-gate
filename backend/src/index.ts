import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB, stopActiveSessionsTracking, cookieConfig } from './shared';
import morgan from 'morgan';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { metricsMiddleware, stopMetricsCollection } from './features/metrics';
import { processingRegistry } from './features/council';

// Load environment variables from .env file
dotenv.config();

// Initialize the Express application
// In Spring, this is similar to the ApplicationContext.
// In FastAPI, this is `app = FastAPI()`.
const app = express();
const PORT = process.env.PORT || 4000;
const allowedOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set. Refusing to start without a signing secret.');
  process.exit(1);
}

// Middleware Configuration
// ------------------------
// Trust only the first proxy hop (e.g., Cloudflare, Nginx).
// Setting to `true` trusts ALL X-Forwarded-For values, allowing clients
// to spoof IPs and bypass rate limiting. Using `1` trusts only the
// immediate upstream proxy's header.
app.set('trust proxy', 1);

// Metrics collection - must be early to capture all requests
app.use(metricsMiddleware);

// CORS (Cross-Origin Resource Sharing)
// Allows our frontend (running on a different port) to communicate with this backend.
// Similar to @CrossOrigin in Spring or CORSMiddleware in FastAPI.
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // Allow non-browser tools
    if (allowedOrigins.length === 0) {
      return callback(new Error('CORS origin not configured'), false);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true, // Allow cookies to be sent
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400, // 24 hours preflight cache
}));

// Cookie Parser
// Parse cookies attached to the client request
app.use(cookieParser());

// JSON Parser
// Automatically parses incoming JSON payloads in requests (Content-Type: application/json).
// Populates `req.body` with the parsed data.
// In Spring, this is handled by Jackson automatically for @RequestBody.
// In FastAPI, Pydantic models handle this.
app.use(express.json({ limit: '1mb' }));

// Basic security headers (lightweight Helmet alternative)
app.use((req, res, next) => {
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
});

// Request logging (structured to file + console)
const logDirectory = path.join(process.cwd(), 'logs');
if (!existsSync(logDirectory)) {
  mkdirSync(logDirectory, { recursive: true });
}
const accessLogStream = createWriteStream(path.join(logDirectory, 'access.log'), { flags: 'a' });
app.use(
  morgan('combined', {
    stream: accessLogStream,
  })
);
app.use(morgan('combined'));

// Simple double-submit CSRF protection for cookie-auth flows
app.use((req, res, next) => {
  const csrfHeader = req.header('x-csrf-token');
  const csrfCookie = req.cookies?.csrfToken;
  const method = req.method.toUpperCase();
  const requiresCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  // Issue a CSRF token if none present
  if (!csrfCookie) {
    const token = require('crypto').randomBytes(16).toString('hex');
    res.cookie('csrfToken', token, {
      httpOnly: false, // CSRF token must be readable by frontend
      sameSite: cookieConfig.sameSite,
      secure: cookieConfig.secure,
      domain: cookieConfig.domain,
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    // Reject state-changing requests without a token
    // Client must first make a GET request to obtain the CSRF token
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

import { gateRoutes } from './features/gate';
import { authRoutes } from './features/auth';
import { chatRoutes } from './features/chat';
import { sessionRoutes } from './features/session';
import { metricsRoutes } from './features/metrics';
import { councilRoutes } from './features/council';

// ... (previous middleware)

// Routes
// ------

// Mount the Gate routes under /api/gate
app.use('/api/gate', gateRoutes);

// Auth status routes
app.use('/api/auth', authRoutes);

// Mount the Chat routes under /api/chat
app.use('/api/chat', chatRoutes);

// Mount the Session routes under /api/sessions
app.use('/api/sessions', sessionRoutes);

// Mount the Council routes under /api/council
app.use('/api/council', councilRoutes);

// Health Check Endpoint
app.get('/health', (req: Request, res: Response) => {
  // res.json() sends a JSON response with status 200 by default.
  // Equivalent to returning a Dict/Pydantic model in FastAPI or ResponseEntity in Spring.
  res.json({ status: 'ok', message: 'Chatbot Gate Backend is running' });
});

// Metrics endpoint for Prometheus (internal only)
app.use('/metrics', metricsRoutes);

// Basic Error Handling Middleware
// Express uses a middleware function with 4 arguments (err, req, res, next) to handle errors.
// This catches any errors thrown in routes.
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const statusCode = res.statusCode >= 400 ? res.statusCode : 500;
  const errorId = Date.now().toString(36);

  console.error(`[${errorId}]`, err);

  res.status(statusCode).json({
    error: 'Internal server error',
    requestId: errorId,
  });
});

// Start the Server
const startServer = async () => {
  try {
    // Connect to MongoDB before accepting requests
    await connectDB();

    const server = app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });

    // Graceful shutdown handler
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n[${signal}] Shutting down gracefully...`);

      // 1. Stop accepting new connections and wait for existing requests to complete
      await new Promise<void>((resolve) => {
        server.close((err) => {
          if (err) console.error('Error closing HTTP server:', err);
          else console.log('HTTP server closed');
          resolve(); // Continue shutdown even on error
        });
      });

      // 2. Cleanup SSE clients and abort in-progress processing
      processingRegistry.shutdown();
      console.log('SSE registry shut down');

      // 3. Stop metrics collection timer
      stopMetricsCollection();
      console.log('Metrics collection stopped');

      // 4. Stop active sessions tracking
      stopActiveSessionsTracking();
      console.log('Active sessions tracking stopped');

      // 5. Close MongoDB connection
      try {
        await mongoose.connection.close(false);
        console.log('MongoDB connection closed');
      } catch (err) {
        console.error('Error closing MongoDB:', err);
      }

      // 6. Close log stream and exit
      accessLogStream.end(() => {
        console.log('Access log stream closed');
        process.exit(0);
      });

      // Timeout fallback (10 seconds)
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
