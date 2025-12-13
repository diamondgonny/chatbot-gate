/**
 * Application Entry Point
 * Server startup, environment loading, and graceful shutdown.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import morgan from 'morgan';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { createApp } from './app';
import { validateEnv, connectDB, stopActiveSessionsTracking, logCookieConfig } from './shared';
import { stopMetricsCollection } from './features/metrics';
import { processingRegistry } from './features/council';

// Validate required environment variables
validateEnv();

const PORT = process.env.PORT || 4000;

// Create Express application with production settings
const app = createApp();

// Log configuration (production startup info)
logCookieConfig();

// Setup file-based request logging (production only)
const logDirectory = path.join(process.cwd(), 'logs');
if (!existsSync(logDirectory)) {
  mkdirSync(logDirectory, { recursive: true });
}
const accessLogStream = createWriteStream(path.join(logDirectory, 'access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));
app.use(morgan('combined'));

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
