import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { connectDB } from './db';
import morgan from 'morgan';
import { createWriteStream } from 'fs';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

// Connect to MongoDB
connectDB();

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
// Trust proxy for correct client IP (e.g., when behind Nginx/Heroku)
app.set('trust proxy', true);

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

  // Issue a CSRF token if none present
  if (!csrfCookie) {
    const token = require('crypto').randomBytes(16).toString('hex');
    res.cookie('csrfToken', token, {
      httpOnly: false,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });
    return next();
  }

  // For state-changing requests, require header to match cookie
  const method = req.method.toUpperCase();
  const requiresCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (requiresCsrf && csrfHeader !== csrfCookie) {
    return res.status(403).json({ error: 'CSRF token mismatch' });
  }

  next();
});

import gateRoutes from './routes/gateRoutes';
import chatRoutes from './routes/chatRoutes';
import sessionRoutes from './routes/sessionRoutes';

// ... (previous middleware)

// Routes
// ------

// Mount the Gate routes under /api/gate
app.use('/api/gate', gateRoutes);

// Mount the Chat routes under /api/chat
app.use('/api/chat', chatRoutes);

// Mount the Session routes under /api/sessions
app.use('/api/sessions', sessionRoutes);

// Health Check Endpoint
app.get('/health', (req: Request, res: Response) => {
  // res.json() sends a JSON response with status 200 by default.
  // Equivalent to returning a Dict/Pydantic model in FastAPI or ResponseEntity in Spring.
  res.json({ status: 'ok', message: 'Chatbot Gate Backend is running' });
});

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
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
