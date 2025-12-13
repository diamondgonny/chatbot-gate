import mongoose from 'mongoose';
import { config } from './config';
import { mongoConnectionState, activeSessions, getDeploymentEnv } from './observability';
import { ChatSession } from './models/chatSession.model';

// Active sessions tracking interval handle
let activeSessionsInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Stop active sessions tracking (for graceful shutdown)
 */
export const stopActiveSessionsTracking = (): void => {
  if (activeSessionsInterval) {
    clearInterval(activeSessionsInterval);
    activeSessionsInterval = null;
  }
};

// Connect to MongoDB
// Mongoose handles connection pooling automatically
// Note: MONGO_URI validation is handled by validateEnv() at startup
export const connectDB = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('✅ MongoDB connected successfully');

    // Set up MongoDB connection state metrics
    const deploymentEnv = getDeploymentEnv();

    mongoose.connection.on('connected', () => {
      mongoConnectionState.labels(deploymentEnv).set(1);
    });

    mongoose.connection.on('disconnected', () => {
      mongoConnectionState.labels(deploymentEnv).set(0);
    });

    mongoose.connection.on('connecting', () => {
      mongoConnectionState.labels(deploymentEnv).set(2);
    });

    mongoose.connection.on('disconnecting', () => {
      mongoConnectionState.labels(deploymentEnv).set(3);
    });

    // Set initial state
    mongoConnectionState.labels(deploymentEnv).set(mongoose.connection.readyState);

    // Start periodic active sessions tracking (sessions with activity in last 5 minutes)
    const ACTIVE_SESSION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
    const UPDATE_INTERVAL_MS = 30 * 1000; // Update every 30 seconds

    const updateActiveSessions = async () => {
      try {
        const cutoff = new Date(Date.now() - ACTIVE_SESSION_WINDOW_MS);
        const count = await ChatSession.countDocuments({ updatedAt: { $gte: cutoff } });
        activeSessions.labels(deploymentEnv).set(count);
      } catch (err) {
        console.error('[Metrics] Failed to update active sessions:', err);
      }
    };

    // Initial update
    await updateActiveSessions();
    console.log('[Metrics] Active sessions tracking started (5-minute window, 30s interval)');

    // Periodic updates (store handle for cleanup on shutdown)
    activeSessionsInterval = setInterval(updateActiveSessions, UPDATE_INTERVAL_MS);
    activeSessionsInterval.unref();
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Export mongoose for use in models
export default mongoose;
